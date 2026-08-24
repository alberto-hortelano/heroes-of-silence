/**
 * Las fronteras de `CLAUDE.md`, comprobadas.
 *
 * Un contrato que solo vive en la documentación se rompe sin que nadie se
 * entere; aquí se rompe en rojo. Son ocho guardias: seis leen el código con
 * una expresión regular, uno recorre el catálogo de rasgos y el de efectos
 * temporales llama de verdad a los lectores del motor. Cuestan milisegundos,
 * así que caben en cada `pnpm test` sin frenar a nadie.
 *
 * Los ocho nacen en verde. Un guardia que nace rojo se ignora desde el primer
 * día — y uno que nace verde sin comprobar que MUERDE no guarda nada: el de la
 * frontera con el servidor se probó metiendo un `import` del director en
 * `src/core/ai/turn.ts`, viéndolo rojo y quitándolo. Se volvió a probar con la
 * forma que se le colaba (`import 'ruta';`, sin `from`) al cerrarle ese hueco.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { stackSpeed } from '../src/core/battle/battle.js';
import { effectiveAttack } from '../src/core/battle/damage.js';
import { applyEffect, effectiveLuck, EFFECT_KINDS, type EffectKind } from '../src/core/battle/effects.js';
import type { BattleStack } from '../src/core/battle/types.js';
import { CREATURE_TRAITS } from '../src/core/types.js';

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

// Los listados y el contenido se resuelven UNA vez: seis guardias recorrían
// `src/core` entero por su cuenta, y la sexta lectura del mismo fichero costaba
// más que todo lo demás junto.
const CORE = ficheros('src/core');
const CLIENTE = ficheros('src/client');
const SERVIDOR = ficheros('src/server');

const CACHE = new Map<string, string>();
function leer(ruta: string): string {
  const guardado = CACHE.get(ruta);
  if (guardado !== undefined) return guardado;
  const texto = readFileSync(join(RAIZ, ruta), 'utf8');
  CACHE.set(ruta, texto);
  return texto;
}

/**
 * Cualquier forma de traerse `destino`, incluida la que no tiene `from`.
 *
 * Las formas son `from 'x'`, `import('x')`, `require('x')` y `import 'x';` a
 * secas, y de la última —la de efecto lateral, que es justo la que se usa cuando
 * lo único que se quiere es enchufar el módulo— eran ciegos los dos guardias de
 * importación: `import '../../server/director.js'` los dejaba a los ocho en
 * verde. Un guardia con un hueco conocido invita a usar el hueco.
 */
function importaDe(destino: RegExp): RegExp {
  return new RegExp(`(?:from|import\\(|require\\(|import)\\s*['"](?:${destino.source})`);
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

/**
 * Cada tipo de efecto temporal con el lector del motor que suma su total.
 *
 * La tabla no es documentación: el test la recorre LLAMANDO a cada lector, así
 * que uno escrito y muerto no puede satisfacerla. Va tipada por `string` a
 * propósito y no por `EffectKind`: con `Record<EffectKind, …>` un tipo nuevo
 * rompería el `tsc` y el aserto de cobertura no llegaría a correr nunca.
 */
const LECTORES_DE_EFECTO: Readonly<Record<string, (s: BattleStack) => number>> = {
  speed: stackSpeed,
  luck: effectiveLuck,
  attack: (s) => effectiveAttack(s, null),
};

/** Un stack limpio, fuera de tablero: solo se le cuelgan efectos y se lee. */
function stackDePrueba(): BattleStack {
  return {
    id: 'guardia-0',
    side: 'attacker',
    slot: 0,
    creature: 'pikeman',
    count: 10,
    topHp: 1,
    hex: { col: 0, row: 0 },
    shotsLeft: 0,
    retaliated: false,
    defending: false,
    waited: false,
    acted: false,
    gotMoraleBonus: false,
    morale: 0,
    luck: 0,
    effects: [],
  };
}

describe('invariantes del proyecto', () => {
  it('`core` es puro: no importa nada de node', () => {
    // Sin esto los mismos tests no valdrían para el navegador y para el
    // servidor, que es justo lo que hace barato el núcleo.
    expect(infractores(CORE, importaDe(/node:/))).toEqual([]);
  });

  it('`core` es puro: no toca el DOM', () => {
    expect(
      infractores(
        CORE,
        /\b(document|window|navigator|localStorage)\s*\.|\b(HTMLElement|HTMLImageElement|CanvasRenderingContext2D)\b/,
      ),
    ).toEqual([]);
  });

  it('`core` no conoce al servidor: la dependencia va en un solo sentido', () => {
    // La salida fácil a «el agente tiene que defender» era un `import` del
    // director dentro de `core`, y los otros guardias la habrían dejado pasar:
    // el servidor no es `node:` ni es DOM. El núcleo se entera de que hay
    // alguien conduciendo por un TIPO de callback (`BattleTakeover`), no por
    // una importación — así los mismos tests siguen valiendo en el navegador,
    // donde `src/server` ni existe.
    expect(
      infractores(CORE, importaDe(/@server\/|[^'"]*\.\.?\/server\/|[^'"]*\/src\/server\//)),
    ).toEqual([]);
  });

  it('toda tirada pasa por createRng: no hay Math.random suelto', () => {
    // Sin semilla no hay partida reproducible y un test de batalla sería una
    // lotería que un día falla sin que nadie sepa por qué.
    expect(infractores([...CORE, ...CLIENTE, ...SERVIDOR], /Math\.random\s*\(/)).toEqual([]);
  });

  it('el cliente no aplica reglas: la única puerta al núcleo es session.ts', () => {
    // El cliente pinta y manda intenciones. Cuando la partida se juegue por
    // WebSocket, lo que cambia es esa capa y solo esa — pero solo si nadie más
    // ha abierto una puerta lateral mientras tanto.
    const puertas =
      /\b(applyAdventureAction|applyAction|resolvePendingBattle|settleBattle|playAiTurn|chooseBattleAction|newGame)\b/;
    const fuera = CLIENTE.filter((r) => r !== 'src/client/session.ts');
    expect(infractores(fuera, puertas)).toEqual([]);
  });

  it('ningún rasgo de criatura está declarado y muerto', () => {
    // Un rasgo escrito en el tipo y en `data/creatures.json` que el motor no
    // lee es una promesa sin respaldo: el jugador paga por una caballería que
    // no carga y el agente decide con una ficha que miente. Este guardia nace
    // en verde justo después de implementar los cuatro que faltaban.
    const motor = CORE.filter((r) => r !== 'src/core/types.ts')
      .map(leer)
      .join('\n');

    const muertos = CREATURE_TRAITS.filter((rasgo) => !motor.includes(`'${rasgo}'`));
    expect(muertos, `rasgos declarados que el motor no lee: ${muertos.join(', ')}`).toEqual([]);
  });

  it('ningún tipo de efecto temporal está declarado y sin lector', () => {
    // Un efecto se cuelga del stack y solo existe si alguien suma su total al
    // leer. `effectiveDefense` (`damage.ts`) NO llama a `effectTotal`: el día
    // que #26 traiga un hechizo de defensa, el efecto quedaría colgado del
    // stack y no lo leería nadie — misma promesa sin respaldo que un rasgo
    // muerto.
    //
    // Las dos mitades del guardia:
    //  1. la tabla cubre `EFFECT_KINDS` EXACTAMENTE, así que añadir `'defense'`
    //     pone esto rojo hasta que alguien declare quién lo lee;
    //  2. cada lector se LLAMA de verdad y su salida tiene que moverse al
    //     colgar un efecto de ese tipo.
    // La segunda es la que no tenía el ancla textual anterior: bastaba escribir
    // dentro de `effects.ts` un `effectiveDefense()` que no llamara nadie para
    // ponerla verde, y un lector válido escrito como bucle sobre `EFFECT_KINDS`
    // la ponía roja.
    expect(Object.keys(LECTORES_DE_EFECTO).sort()).toEqual([...EFFECT_KINDS].sort());

    for (const [kind, lector] of Object.entries(LECTORES_DE_EFECTO)) {
      const s = stackDePrueba();
      const antes = lector(s);
      applyEffect(s, { kind: kind as EffectKind, amount: 2, source: 'guardia', roundsLeft: 2 });
      expect(lector(s), `${kind}: su lector no suma el efecto`).not.toBe(antes);
    }
  });

  it('FAL_KEY no llega al navegador', () => {
    // El arte se genera en scripts de línea de órdenes; el cliente solo carga
    // PNGs. Una clave de pago en el bundle es un incidente, no un despiste.
    expect(infractores(CLIENTE, /FAL_KEY|process\.env/)).toEqual([]);
  });
});
