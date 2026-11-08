/**
 * La orden `encolar`: qué encargos entran en la cola por cada bandera (una unidad,
 * un fichero, o una familia de piezas con sus guías antes), con `--solo` y
 * `--rehacer`.
 */
import { readFile } from 'node:fs/promises';
import { soloDe } from '../../comun/argumentos.js';
import { escribirGuiasDeBajadas } from '../bajadas.js';
import { encargosDeLaBase, escribirFuentesDeLaBase } from '../base.js';
import { escribirGuiasDeDiagonales } from '../diagonales.js';
import type { Encargo } from '../encargo.js';
import {
  encargoDeTexturaDeRelieve,
  encargosDeModulos,
  TEXTURAS_DE_RELIEVE,
} from '../escenario/modulos.js';
import { encargosDeLaderas, escribirGuiasDeLaderas } from '../laderas.js';
import {
  ESTILOS_DE_MAPA,
  encargoDeCofre,
  encargoDeMuestra,
  encargosDeHitos,
  encargosDeMurallaNS,
  encargosDePiezas,
  encargosDePuestos,
  encargosDeTablillas,
  escribirGuiasDePuestos,
} from '../mapa.js';
import { encargoDeLamina, encargosDePiezasDensas, encargosDeTexturas } from '../mapa-denso.js';
import { encargosDeLaMurallaDeBatalla, escribirGuiasDeLaMuralla } from '../muralla-de-batalla.js';
import { escribirGuiaDelMuro } from '../muros.js';
import { encargosDeParedesYPuentes, escribirGuias } from '../paredes-puentes.js';
import { encargosDeRampas, escribirGuiasDeRampas } from '../rampas.js';
import { encargoDelRecinto, escribirGuiaDelRecinto } from '../recinto.js';
import { encargosDelRelieve } from '../relieve.js';
import {
  encargoDeGiro,
  encargoDeIdentidad,
  encargosDeOchoDirecciones,
  unidad,
} from '../unidades.js';
import { COLA, faccionDe, type Orden } from './orden.js';

/**
 * Encola `todos`, o solo los que nombra `--solo=` por su nombre corto (`corto`),
 * olvidándolos antes con `--rehacer` y sin repetir lo que ya está en la cola. Un
 * nombre de `--solo=` que no está lanza diciendo cuáles hay; `tambien` acepta los
 * que existen pero aún no se pueden encolar (lo que espera en la base). Lo usan
 * las tablillas y la base.
 */
async function encolarConSolo(
  args: readonly string[],
  todos: readonly Encargo[],
  corto: (id: string) => string,
  tambien: (nombre: string) => boolean = () => false,
): Promise<void> {
  const solo = soloDe(args);
  const desconocidos = (solo ?? []).filter(
    (s) => !todos.some((e) => corto(e.id) === s) && !tambien(s),
  );
  if (desconocidos.length > 0) {
    throw new Error(
      `--solo: no hay ${desconocidos.join(', ')}; se pueden pedir ${todos.map((e) => corto(e.id)).join(', ')}`,
    );
  }
  await COLA.preparar();
  for (const bruto of todos) {
    if (solo !== undefined && !solo.includes(corto(bruto.id))) continue;
    if (args.includes('--rehacer')) await COLA.olvidar(bruto.id);
    const estado = await COLA.estado();
    if (Object.values(estado).some((ids) => ids.includes(bruto.id))) {
      console.log(`ya está en la cola: ${bruto.id}`);
      continue;
    }
    console.log(`encolado ${(await COLA.encolar(bruto)).id}`);
  }
}

export async function encolar(args: readonly string[]): Promise<void> {
  if (args.includes('--piezas-mapa')) {
    for (const bruto of encargosDePiezas()) {
      if (args.includes('--rehacer')) await COLA.olvidar(bruto.id);
      console.log(`encolado ${(await COLA.encolar(bruto)).id}`);
    }
    return;
  }
  if (args.includes('--hitos')) {
    for (const bruto of encargosDeHitos()) {
      if (args.includes('--rehacer')) await COLA.olvidar(bruto.id);
      console.log(`encolado ${(await COLA.encolar(bruto)).id}`);
    }
    return;
  }
  // Las tablillas por rumbo y la muralla norte-sur (§29). `--solo=oeste,norte`
  // o `--solo=muro-ns-1`, por el id sin el prefijo del encargo. Lo que ya está en
  // la cola no se repite.
  if (args.includes('--tablillas') || args.includes('--muralla-ns')) {
    if (args.includes('--muralla-ns')) console.log(`guía → ${await escribirGuiaDelMuro()}`);
    const todos = args.includes('--tablillas') ? encargosDeTablillas() : encargosDeMurallaNS();
    await encolarConSolo(args, todos, (id) => id.replace(/^mapa-(nodo-hito-tablilla-)?/, ''));
    return;
  }
  // Las tres obras del puesto fronterizo (fase 4), cada una con su guía.
  // `--solo=caseta,torreta,torre`.
  if (args.includes('--puestos')) {
    for (const g of await escribirGuiasDePuestos()) console.log(`guía → ${g}`);
    await encolarConSolo(args, encargosDePuestos(), (id) => id.replace(/^mapa-puesto-/, ''));
    return;
  }
  // La muralla del tablero de batalla: caras, tapas, portadas y la escalera,
  // con su guía. Una portada cerrada es la edición de su abierta: entra cuando
  // la abierta ya está en disco (se vuelve a correr).
  if (args.includes('--muralla-batalla')) {
    for (const g of await escribirGuiasDeLaMuralla()) console.log(`guía → ${g}`);
    const { encargos, esperan } = encargosDeLaMurallaDeBatalla();
    await encolarConSolo(
      args,
      encargos,
      (id) => id.replace(/^batalla-/, ''),
      (s) => esperan.includes(s),
    );
    for (const e of esperan) console.log(`espera a su abierta: ${e}`);
    return;
  }
  if (args.includes('--cofre')) {
    const bruto = encargoDeCofre();
    if (args.includes('--rehacer')) await COLA.olvidar(bruto.id);
    console.log(`encolado ${(await COLA.encolar(bruto)).id}`);
    return;
  }
  // La base caminable (vuelta 3): los maestros, las placas y las ediciones, en
  // serie; cada uno se encola cuando ya está lo que lleva de referencia, así que
  // se vuelve a correr cuando haya llegado lo de la tanda anterior. Las guías y
  // las hojas de identidad que falten se escriben antes en `fuentes/`.
  const base = args.indexOf('--base');
  if (base >= 0) {
    const faccion = faccionDe(
      args[base + 1],
      'pnpm taller encolar --base templarios [--rehacer] [--solo=maestro-t1,placa-t1,edicion-town-hall,…]',
    );
    for (const g of await escribirFuentesDeLaBase(faccion)) console.log(`fuente: ${g}`);
    const { listos, esperan } = encargosDeLaBase(faccion);
    // `--solo=`: por el id sin `base-<facción>-`. Con `--rehacer`, solo esos se
    // olvidan: sin él, `--rehacer` volvería a pedir la base entera.
    const prefijo = `base-${faccion}-`;
    await encolarConSolo(
      args,
      listos,
      (id) => id.slice(prefijo.length),
      (s) => esperan.some((e) => e.startsWith(`${s} `)),
    );
    for (const e of esperan) console.log(`espera: ${e}`);
    return;
  }
  // Sin la orden, el bucle de abajo no encolaría nada y callaría.
  const retirada = ['--edificios', '--efectos', '--iconos-recursos'].find((x) => args.includes(x));
  if (retirada !== undefined) {
    throw new Error(
      `${retirada} se retiró el 06-11-2026 con los edificios, los efectos y los iconos de recursos del 02-10: el cliente no los pinta (su arte está en assets/art/retirado/)`,
    );
  }
  // Los puentes (§17, `paredes-puentes.ts`): primero las guías.
  if (args.includes('--paredes-puentes')) {
    await escribirGuias();
    const solo = soloDe(args);
    const sinPrefijo = (id: string) => id.replace(/^(mapa|modulos)-/, '');
    const todos = encargosDeParedesYPuentes();
    const lista = todos.filter((e) => solo === undefined || solo.includes(sinPrefijo(e.id)));
    if (solo !== undefined && lista.length !== solo.length)
      throw new Error(`--solo: hay ${todos.map((e) => sinPrefijo(e.id)).join(', ')}`);
    for (const bruto of lista) {
      if (args.includes('--rehacer')) await COLA.olvidar(bruto.id);
      console.log(`encolado ${(await COLA.encolar(bruto)).id}`);
    }
    return;
  }
  // Las laderas que encadenan (§20, `laderas.ts`): primero las guías.
  if (args.includes('--laderas')) {
    await escribirGuiasDeLaderas();
    const solo = soloDe(args);
    const sinPrefijo = (id: string) => id.replace(/^modulos-laderas-/, '');
    const todos = encargosDeLaderas();
    const lista = todos.filter((e) => solo === undefined || solo.includes(sinPrefijo(e.id)));
    if (solo !== undefined && lista.length !== solo.length)
      throw new Error(`--solo: hay ${todos.map((e) => sinPrefijo(e.id)).join(', ')}`);
    for (const bruto of lista) {
      if (args.includes('--rehacer')) await COLA.olvidar(bruto.id);
      console.log(`encolado ${(await COLA.encolar(bruto)).id}`);
    }
    return;
  }
  // Las puertas y los tramos en diagonal del recinto de una ciudad (§37): primero su guía.
  if (args.includes('--recinto')) {
    console.log(`guía → ${await escribirGuiaDelRecinto()}`);
    const bruto = encargoDelRecinto();
    if (args.includes('--rehacer')) await COLA.olvidar(bruto.id);
    console.log(`encolado ${(await COLA.encolar(bruto)).id}`);
    return;
  }
  // Las rampas (§35): primero su guía.
  if (args.includes('--rampas')) {
    await escribirGuiasDeRampas();
    const solo = soloDe(args);
    const todos = encargosDeRampas();
    const lista = todos.filter((e) => solo === undefined || solo.includes(e.id));
    if (solo !== undefined && lista.length !== solo.length)
      throw new Error(`--solo: hay ${todos.map((e) => e.id).join(', ')}`);
    for (const bruto of lista) {
      if (args.includes('--rehacer')) await COLA.olvidar(bruto.id);
      console.log(`encolado ${(await COLA.encolar(bruto)).id}`);
    }
    return;
  }
  // El relieve por celdas (§23): las diagonales y las bajadas, primero sus guías.
  if (args.includes('--relieve')) {
    await escribirGuiasDeDiagonales();
    await escribirGuiasDeBajadas();
    const solo = soloDe(args);
    const sinPrefijo = (id: string) => id.replace(/^modulos-/, '');
    const todos = encargosDelRelieve();
    const lista = todos.filter((e) => solo === undefined || solo.includes(sinPrefijo(e.id)));
    if (solo !== undefined && lista.length !== solo.length)
      throw new Error(`--solo: hay ${todos.map((e) => sinPrefijo(e.id)).join(', ')}`);
    for (const bruto of lista) {
      if (args.includes('--rehacer')) await COLA.olvidar(bruto.id);
      console.log(`encolado ${(await COLA.encolar(bruto)).id}`);
    }
    return;
  }
  // Los módulos del escenógrafo y sus texturas (`escenario/modulos.ts`).
  if (args.includes('--modulos') || args.includes('--texturas-relieve')) {
    const todos = args.includes('--modulos')
      ? encargosDeModulos()
      : TEXTURAS_DE_RELIEVE.map(encargoDeTexturaDeRelieve);
    const solo = soloDe(args);
    const lista = todos.filter(
      (e) => solo === undefined || solo.includes(e.id.replace(/^(modulos|textura)-/, '')),
    );
    for (const bruto of lista) {
      if (args.includes('--rehacer')) await COLA.olvidar(bruto.id);
      console.log(`encolado ${(await COLA.encolar(bruto)).id}`);
    }
    return;
  }
  // El arte de los mapas densos (`mapa-denso.ts`). `--solo=a,b` filtra por id
  // sin el prefijo del encargo (`--solo=grass,lava`, `--solo=bosque-verde-1`).
  const densas = args.includes('--texturas-suelo')
    ? encargosDeTexturas()
    : args.includes('--muestras-densas')
      ? (['a', 'b'] as const).map(encargoDeLamina)
      : args.includes('--piezas-densas')
        ? encargosDePiezasDensas()
        : null;
  if (densas !== null) {
    const solo = soloDe(args);
    const sinPrefijo = (id: string) => id.replace(/^(suelo|mapa-denso-lamina|mapa)-/, '');
    const lista = densas.filter((e) => solo === undefined || solo.includes(sinPrefijo(e.id)));
    if (solo !== undefined && lista.length !== solo.length) {
      const hay = densas.map((e) => sinPrefijo(e.id));
      throw new Error(
        `--solo pide ${solo.filter((x) => !hay.includes(x)).join(', ')}, que no existe${solo.length - lista.length > 1 ? 'n' : ''}. Hay: ${hay.join(', ')}`,
      );
    }
    for (const bruto of lista) {
      if (args.includes('--rehacer')) await COLA.olvidar(bruto.id);
      console.log(`encolado ${(await COLA.encolar(bruto)).id}`);
    }
    return;
  }
  if (args.includes('--muestras-mapa')) {
    for (const estilo of ESTILOS_DE_MAPA) {
      const bruto = encargoDeMuestra(estilo);
      if (args.includes('--rehacer')) await COLA.olvidar(bruto.id);
      console.log(`encolado ${(await COLA.encolar(bruto)).id}`);
    }
    return;
  }
  if (args.includes('--giro') || args.includes('--ocho')) {
    for (const a of args.filter((x) => !x.startsWith('--'))) {
      const u = unidad(a);
      // `--solo d0-a,d3-a`: solo esas hojas, para rehacer las que fallan.
      const solo = soloDe(args);
      const lista = args.includes('--giro')
        ? [encargoDeGiro(u)]
        : encargosDeOchoDirecciones(u).filter(
            (e) => solo === undefined || solo.includes(e.id.slice(u.id.length + 1)),
          );
      for (const bruto of lista) {
        if (args.includes('--rehacer')) await COLA.olvidar(bruto.id);
        console.log(`encolado ${(await COLA.encolar(bruto)).id}`);
      }
    }
    return;
  }
  if (args.includes('--atlas')) {
    throw new Error(
      'el atlas de una dirección se retiró el 03-10-2026: toda unidad va en 8 direcciones (`--giro` y después `--ocho`)',
    );
  }
  for (const a of args.filter((x) => !x.startsWith('--'))) {
    const bruto = a.endsWith('.json')
      ? JSON.parse(await readFile(a, 'utf8'))
      : encargoDeIdentidad(unidad(a));
    if (args.includes('--rehacer') && (await COLA.olvidar(bruto.id))) {
      console.log(`olvidado el ${bruto.id} anterior`);
    }
    const e = await COLA.encolar(bruto);
    console.log(`encolado ${e.id}`);
  }
}

/** Lo que entra en la cola. */
export const ORDENES_DE_ENCOLAR: Readonly<Record<string, Orden>> = {
  encolar: {
    uso: `pnpm taller encolar <unidad|fichero.json>… [--rehacer]
    una unidad de \`unidades.ts\` encola su identidad, su giro con \`--giro\` o sus 16 hojas de
    8 direcciones con \`--ocho\` (24 si dispara: la C es el disparo; \`--solo=d0-a,d3-a\`, solo
    esas); \`--rehacer\` olvida el encargo cerrado de antes
pnpm taller encolar --hitos            los hitos de los nodos sin pieza de paso (#176, \`mapa.ts\`)
pnpm taller encolar --cofre            el cofre del mapa, pieza suelta (#147, \`mapa.ts\`)
pnpm taller encolar --piezas-mapa | --muestras-mapa
    las piezas sueltas y las láminas de muestra del mapa del 01-10 (\`mapa.ts\`)
pnpm taller encolar --puestos [--solo=caseta,torreta,torre]
    la caseta, la torreta y la torre del puesto fronterizo, con su guía (\`mapa.ts\`)
pnpm taller encolar --tablillas | --muralla-ns [--solo=…]
    las tablillas por rumbo y la muralla norte-sur (§29, \`mapa.ts\`; los tramos, con su guía, \`muros.ts\`)
pnpm taller encolar --texturas-suelo | --muestras-densas | --piezas-densas [--solo=…]
    el arte de los mapas densos (\`mapa-denso.ts\`)
pnpm taller encolar --modulos | --texturas-relieve [--solo=…]
    las hojas de módulos del escenógrafo
pnpm taller encolar --paredes-puentes [--solo=…]
    los puentes (§17), con su guía
pnpm taller encolar --laderas [--solo=roca-este-1,…]
    las laderas que encadenan (§20, \`laderas.ts\`), con su guía
pnpm taller encolar --relieve [--solo=diagonales-roca-se-1,bajadas-roca-1,…]
    las diagonales y las bajadas del relieve por celdas (§23), con su guía
pnpm taller encolar --rampas [--solo=rampa-roca-1,…]
    las rampas que abren la pared (§35, \`rampas.ts\`), con su guía
pnpm taller encolar --recinto [--rehacer]
    las puertas y los tramos en diagonal del recinto de una ciudad (§37, \`recinto.ts\`), con su guía
pnpm taller encolar --muralla-batalla [--solo=cara-piedra,…] [--rehacer]
    la muralla del tablero de batalla: caras, tapas, portadas y escalera, con su guía (\`muralla-de-batalla.ts\`)
pnpm taller encolar --base templarios [--solo=maestro-t1,placa-t1,…]
    la plaza de la base en un solo cuadro (vuelta 3, \`base.ts\`): maestro, placa y ediciones de
    cada tramo y, con \`--solo=retoque-<id>,abierta-<id>\`, el retoque de un edificio y la
    versión abierta de cada morada`,
    correr: async (resto) => {
      await encolar(resto);
    },
  },
};
