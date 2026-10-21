/**
 * Sin `data-tema` nada cambia: el estilo computado del neutro (el espectador, y
 * la partida o la arena antes de ponerse el tema) es el de las hojas de un `ref`
 * de git, elemento a elemento.
 *
 *     npx tsx tools/qa/neutro.ts [ref]        # por defecto, HEAD
 *
 * Arranca su propio vite (`vite-propio.ts`) y un Chromium sin pantalla. En cada
 * página y escena (la partida con el mapa y, en la misma página, con la base; la
 * arena en el montaje, la edición y el equipo; el espectador) quita `data-tema`,
 * apaga las hojas que sirve vite y pone en su lugar las de ahora, leídas del
 * disco, con sus `@import` dentro; lee las propiedades de `PROPIEDADES` de cada
 * elemento y de sus pseudoelementos (`PSEUDOS`); luego hace lo mismo con las del
 * `ref` (`git show`) en la misma página, sin recargar, y compara. El mismo DOM,
 * dos juegos de hojas: lo único que cambia es el CSS. Basta el esbozo del suelo:
 * no se mira el lienzo.
 *
 * Sale con 1 y la lista si hay una sola diferencia. Lo hicieron a mano dos
 * ingenieros con un guion en el scratchpad (tarea del tema por ejército) antes de
 * que fuera una orden.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, normalize, resolve } from 'node:path';
import { chromium, type Page } from 'playwright';
import { arrancarVite, chromiumInstalado, esperarElSuelo, matarGrupo } from './vite-propio.js';

const RAIZ = resolve(import.meta.dirname, '../..');

/** Lo que se compara de cada elemento: color, fondo, bordes, letra, sombras y medidas. */
const PROPIEDADES = [
  'color',
  'background-color',
  'background-image',
  'border-top-color',
  'border-right-color',
  'border-bottom-color',
  'border-left-color',
  'border-top-width',
  'border-right-width',
  'border-bottom-width',
  'border-left-width',
  'border-top-style',
  'border-bottom-style',
  'border-radius',
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'font-variant-numeric',
  'line-height',
  'letter-spacing',
  'text-transform',
  'box-shadow',
  'text-shadow',
  'outline-color',
  'outline-style',
  'outline-width',
  'accent-color',
  'display',
  'opacity',
  'padding-top',
  'padding-left',
  'margin-top',
  'margin-left',
  'width',
  'height',
  'content',
] as const;

/** Lo que se lee de cada elemento: él mismo (`''`) y sus pseudoelementos. */
const PSEUDOS = ['', '::before', '::after', '::marker'] as const;

/**
 * Lo nuevo que sin tema no se ve (los adornos de las piezas de los temas): se
 * comprueba aparte, con las hojas de ahora y sin ocultarlo, que su `display` sea
 * `none`.
 */
const OCULTOS_SIN_TEMA = ['.adornos-del-mapa'];
/**
 * Lo que existe ahora y no en un `ref` de antes del tema por ejército (#ejercito,
 * el selector de la arena, que sí se ve; y lo de arriba): sin su regla, su alto
 * movía la barra y todo lo de detrás. Se oculta en las dos pasadas: no es neutro
 * ni tema, es nuevo.
 */
const NUEVOS = ['.selector-de-la-barra', ...OCULTOS_SIN_TEMA];

/** Una hoja del cliente en el disco o en un `ref`, con sus `@import` relativos dentro. */
function hoja(ruta: string, ref: string | null): string {
  const texto =
    ref === null
      ? readFileSync(join(RAIZ, ruta), 'utf8')
      : execFileSync('git', ['show', `${ref}:${ruta}`], { cwd: RAIZ, encoding: 'utf8' });
  return texto.replace(/@import\s+'([^']+)';/g, (_, rel: string) =>
    hoja(normalize(join(dirname(ruta), rel)), ref),
  );
}

interface Escena {
  readonly nombre: string;
  readonly url: string;
  readonly hojas: readonly string[];
  /** Lo que se hace en la página para llegar a la escena, ya cargada. */
  readonly llegar?: (page: Page) => Promise<void>;
  /** Sigue en la página de la escena de antes, sin volver a cargarla. */
  readonly enLaMisma?: boolean;
}

const PARTIDA = ['src/client/style.css'];
const ARENA = ['src/client/style.css', 'src/client/arena/arena.css'];

const ESCENAS: readonly Escena[] = [
  {
    nombre: 'partida, mapa',
    url: '/?seed=7',
    hojas: PARTIDA,
    llegar: async (page) => {
      // La partida abre en la base (19-10-2026): se sale al mapa, y la escena
      // siguiente vuelve a ella por la lista de castillos.
      await page.waitForSelector('#app[data-escena="town"]', { timeout: 60_000 });
      await page.click('[data-action="close-town"]');
      await page.waitForSelector('#app[data-escena="adventure"]');
      await esperarElSuelo(page, 'partida', 120_000, () => {}, 'esbozado');
    },
  },
  {
    nombre: 'partida, base',
    url: '/?seed=7',
    hojas: PARTIDA,
    enLaMisma: true,
    llegar: async (page) => {
      await page.click('button[data-action="open-town"]');
      await page.waitForSelector('#app[data-escena="town"]');
    },
  },
  {
    nombre: 'arena, montaje',
    url: '/arena/?seed=3',
    hojas: ARENA,
    llegar: async (page) => {
      await page.waitForSelector('#catalogo button', { timeout: 60_000 });
    },
  },
  {
    nombre: 'arena, edición',
    url: '/arena/?seed=3',
    hojas: ARENA,
    llegar: async (page) => {
      await page.waitForSelector('#catalogo button', { timeout: 60_000 });
      await page.click('[data-arena="ir-a-edicion"]');
      await page.waitForSelector('#app[data-escena="edicion"]');
    },
  },
  {
    nombre: 'arena, equipo',
    url: '/arena/?seed=3',
    hojas: ARENA,
    llegar: async (page) => {
      await page.waitForSelector('#catalogo button', { timeout: 60_000 });
      await page.click('[data-arena="ir-a-equipo"]');
      await page.waitForSelector('#app[data-escena="equipo"]');
    },
  },
  { nombre: 'espectador', url: '/espectador/', hojas: PARTIDA },
];

/**
 * Deja `css` como la única hoja de la página, sin `data-tema`: apaga las que
 * sirve vite y pone la suya. Corre en la página (sin funciones con nombre dentro:
 * `tsx` las envuelve en un `__name` que la página no tiene).
 */
function ponerHojas(css: string): void {
  delete document.documentElement.dataset.tema;
  for (const s of document.styleSheets) {
    if ((s.ownerNode as Element | null)?.id !== 'neutro-a-prueba') s.disabled = true;
  }
  let propia = document.getElementById('neutro-a-prueba');
  if (propia === null) {
    propia = document.createElement('style');
    propia.id = 'neutro-a-prueba';
    document.head.append(propia);
  }
  propia.textContent = css;
}

/** Pone `css` como las únicas hojas de la página, con lo nuevo oculto, y lee el estilo de todo. */
async function estiloCon(page: Page, css: string): Promise<string[][]> {
  await page.evaluate(ponerHojas, `${css}\n${NUEVOS.join(',')} { display: none !important; }`);
  return await page.evaluate(
    ({ propiedades, nuevos, pseudos }) => {
      const filas: string[][] = [];
      for (const el of document.querySelectorAll('body *')) {
        // Lo nuevo y lo de dentro no se compara: oculto en las dos pasadas, pero
        // su estilo computado sigue siendo distinto.
        const nuevo = el.closest(nuevos.join(',')) !== null;
        for (const pseudo of pseudos) {
          if (nuevo) {
            filas.push([]);
            continue;
          }
          const e = getComputedStyle(el, pseudo === '' ? null : pseudo);
          filas.push(propiedades.map((p) => e.getPropertyValue(p)));
        }
      }
      return filas;
    },
    { propiedades: [...PROPIEDADES], nuevos: NUEVOS, pseudos: [...PSEUDOS] },
  );
}

/** Quién es el elemento `i` (de `body *`), para decirlo. */
async function quien(page: Page, i: number): Promise<string> {
  return await page.evaluate((i) => {
    const el = document.querySelectorAll('body *')[i];
    if (el === undefined) return `#${i}`;
    const id = el.id ? `#${el.id}` : '';
    const clase =
      typeof el.className === 'string' && el.className
        ? `.${el.className.trim().split(/\s+/).join('.')}`
        : '';
    return `${el.tagName.toLowerCase()}${id}${clase}`;
  }, i);
}

/** Lo de `OCULTOS_SIN_TEMA` que se ve sin tema con las hojas de ahora, dicho por su clase. */
async function visiblesSinTema(page: Page, css: string): Promise<string[]> {
  await page.evaluate(ponerHojas, css);
  return await page.evaluate(
    (ocultos) =>
      [...document.querySelectorAll(ocultos.join(','))]
        .filter((el) => getComputedStyle(el).display !== 'none')
        .map((el) => `${el.className} se ve sin tema`),
    OCULTOS_SIN_TEMA,
  );
}

async function compararEscena(page: Page, base: string, e: Escena, ref: string): Promise<string[]> {
  if (e.enLaMisma !== true) await page.goto(`${base}${e.url}`);
  await e.llegar?.(page);
  // El ratón, fuera de todo: tras un clic se queda encima de un botón, y su
  // `:hover` cambia de dueño entre las dos pasadas.
  await page.mouse.move(1, 1);
  const sinOcultar = (
    await visiblesSinTema(page, e.hojas.map((h) => hoja(h, null)).join('\n'))
  ).map((d) => `${e.nombre}: ${d}`);
  const ahora = await estiloCon(page, e.hojas.map((h) => hoja(h, null)).join('\n'));
  const antes = await estiloCon(page, e.hojas.map((h) => hoja(h, ref)).join('\n'));
  if (ahora.length !== antes.length)
    throw new Error(`${e.nombre}: el DOM cambió entre las dos pasadas`);
  const diferencias: string[] = [];
  for (const [k, fila] of ahora.entries()) {
    for (const [j, valor] of fila.entries()) {
      const suyo = antes[k]?.[j];
      if (valor === suyo) continue;
      const el = await quien(page, Math.floor(k / PSEUDOS.length));
      diferencias.push(
        `${e.nombre}: ${el}${PSEUDOS[k % PSEUDOS.length]} ${PROPIEDADES[j]}: ${suyo} → ${valor}`,
      );
    }
  }
  diferencias.push(...sinOcultar);
  console.log(
    `${e.nombre}: ${ahora.length / PSEUDOS.length} elementos, ${diferencias.length} diferencias`,
  );
  return diferencias;
}

const ref = process.argv[2] ?? 'HEAD';
const vite = await arrancarVite();
const limpiar = (): void => matarGrupo(vite.proceso, console.log);
process.on('exit', limpiar);
const ejecutable = chromiumInstalado(console.log);
const navegador = await chromium.launch(
  ejecutable === undefined ? {} : { executablePath: ejecutable },
);
try {
  const page = await navegador.newPage({ viewport: { width: 1440, height: 900 } });
  const todas: string[] = [];
  for (const e of ESCENAS) todas.push(...(await compararEscena(page, vite.url, e, ref)));
  if (todas.length > 0) {
    for (const d of todas.slice(0, 80)) console.log(`  ${d}`);
    if (todas.length > 80) console.log(`  … y ${todas.length - 80} más`);
    process.exitCode = 1;
  } else {
    console.log(`neutro igual que en ${ref}: 0 diferencias`);
  }
} finally {
  await navegador.close();
  limpiar();
}
