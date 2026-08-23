/**
 * Las fronteras de `CLAUDE.md`, comprobadas.
 *
 * Un contrato que solo vive en la documentación se rompe sin que nadie se
 * entere; aquí se rompe en rojo. Son cuatro lecturas de fichero y cuatro
 * expresiones regulares: cuestan milisegundos, así que caben en cada `pnpm
 * test` sin frenar a nadie.
 *
 * Los cuatro nacen en verde. Un guardia que nace rojo se ignora desde el
 * primer día.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

const RAIZ = new URL('..', import.meta.url).pathname;

function ficheros(dir: string): string[] {
  const out: string[] = [];
  for (const entrada of readdirSync(join(RAIZ, dir), { withFileTypes: true })) {
    const ruta = join(dir, entrada.name);
    if (entrada.isDirectory()) out.push(...ficheros(ruta));
    else if (extname(entrada.name) === '.ts') out.push(ruta);
  }
  return out;
}

function leer(ruta: string): string {
  return readFileSync(join(RAIZ, ruta), 'utf8');
}

/** Ficheros que incumplen, con la línea que lo hace: el mensaje del fallo. */
function infractores(rutas: string[], patron: RegExp): string[] {
  const out: string[] = [];
  for (const ruta of rutas) {
    for (const [i, linea] of leer(ruta).split('\n').entries()) {
      if (patron.test(linea)) out.push(`${ruta}:${i + 1} → ${linea.trim()}`);
    }
  }
  return out;
}

describe('invariantes del proyecto', () => {
  it('`core` es puro: no importa nada de node', () => {
    // Sin esto los mismos tests no valdrían para el navegador y para el
    // servidor, que es justo lo que hace barato el núcleo.
    expect(infractores(ficheros('src/core'), /from ['"]node:|require\(['"]node:/)).toEqual([]);
  });

  it('`core` es puro: no toca el DOM', () => {
    expect(
      infractores(
        ficheros('src/core'),
        /\b(document|window|navigator|localStorage)\s*\.|\b(HTMLElement|HTMLImageElement|CanvasRenderingContext2D)\b/,
      ),
    ).toEqual([]);
  });

  it('toda tirada pasa por createRng: no hay Math.random suelto', () => {
    // Sin semilla no hay partida reproducible y un test de batalla sería una
    // lotería que un día falla sin que nadie sepa por qué.
    const rutas = [...ficheros('src/core'), ...ficheros('src/client'), ...ficheros('src/server')];
    expect(infractores(rutas, /Math\.random\s*\(/)).toEqual([]);
  });

  it('el cliente no aplica reglas: la única puerta al núcleo es session.ts', () => {
    // El cliente pinta y manda intenciones. Cuando la partida se juegue por
    // WebSocket, lo que cambia es esa capa y solo esa — pero solo si nadie más
    // ha abierto una puerta lateral mientras tanto.
    const puertas =
      /\b(applyAdventureAction|applyAction|resolvePendingBattle|settleBattle|playAiTurn|chooseBattleAction|newGame)\b/;
    const fuera = ficheros('src/client').filter((r) => r !== 'src/client/session.ts');
    expect(infractores(fuera, puertas)).toEqual([]);
  });

  it('FAL_KEY no llega al navegador', () => {
    // El arte se genera en scripts de línea de órdenes; el cliente solo carga
    // PNGs. Una clave de pago en el bundle es un incidente, no un despiste.
    expect(infractores(ficheros('src/client'), /FAL_KEY|process\.env/)).toEqual([]);
  });
});
