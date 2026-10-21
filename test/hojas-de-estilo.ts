/**
 * Leer una hoja de estilo en un test: lo comparten el guardia de colores fijos
 * (`invariantes.test.ts`), el de las fichas de los temas (`temas.test.ts`), el de
 * la paleta medida de las láminas (`paleta-de-las-laminas.test.ts`), el de las
 * letras (`fuentes.test.ts`) y el de las piezas (`piezas-de-tema.test.ts`). Un
 * solo analizador: `bloquesCss`.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { extname, join, relative } from 'node:path';

const RAIZ = join(import.meta.dirname, '..');
const CLIENTE = join(RAIZ, 'src/client');

/** Una hoja de `src/client/`, por su ruta relativa. */
export const leerHoja = (f: string): string => readFileSync(join(CLIENTE, f), 'utf8');

/** Todas las hojas del cliente, relativas a la raíz del repo (`src/client/…`), en orden. */
export function hojasDelCliente(): string[] {
  const hojas = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory()
        ? hojas(join(dir, e.name))
        : extname(e.name) === '.css'
          ? [relative(RAIZ, join(dir, e.name))]
          : [],
    );
  return hojas(CLIENTE).sort();
}

/**
 * Un color escrito: hexadecimal, una función de color o un nombre de los
 * habituales. `transparent` y `currentcolor` no son colores de un tema.
 */
export const COLOR =
  /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|color-mix)\(|(?<![\w-])(?:white|black|red|green|blue|gold|gray|grey|silver|orange|yellow|purple|brown|navy|maroon)(?![\w-])/i;

/**
 * La hoja sin comentarios, con cada línea donde estaba: un comentario pasa a
 * espacios y saltos, así que el número de línea de lo que se caza es el del
 * fichero.
 */
export function sinComentariosCss(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '));
}

/** Las fichas de un bloque, por nombre: `--x: valor;`. */
export function fichasDe(cuerpo: string): Map<string, string> {
  const fichas = new Map<string, string>();
  for (const decl of cuerpo.split(';')) {
    const m = /^\s*(--[a-z0-9-]+)\s*:\s*([\s\S]+?)\s*$/.exec(decl);
    if (m === null) continue;
    const nombre = m[1] as string;
    const valor = m[2] as string;
    if (fichas.has(nombre)) throw new Error(`${nombre} está dos veces en el mismo bloque`);
    fichas.set(nombre, valor);
  }
  return fichas;
}

/** El `:root` neutro de `style.css`: el primer bloque `:root {` del fichero. */
export function neutro(): Map<string, string> {
  const m = /(?:^|\n):root\s*\{([^}]*)\}/.exec(sinComentariosCss(leerHoja('style.css')));
  if (m === null) throw new Error('style.css no tiene un `:root {…}`');
  return fichasDe(m[1] as string);
}

/**
 * Los bloques de `temas.css`: el común (`:root[data-tema]`), cada tema **fundido
 * con el común** (lo del tema gana, como en el navegador: va después y pesa lo
 * mismo), lo que cada tema escribe por su cuenta y lo que sobra fuera de ellos.
 */
export function temas(): {
  comun: Map<string, string>;
  bloques: Map<string, Map<string, string>>;
  propios: Map<string, Map<string, string>>;
  resto: string;
} {
  const css = sinComentariosCss(leerHoja('temas.css'));
  const patronComun = /:root\[data-tema\]\s*\{([^}]*)\}/g;
  const comunes = [...css.matchAll(patronComun)];
  if (comunes.length !== 1)
    throw new Error(`temas.css lleva ${comunes.length} bloques comunes, y va uno`);
  const comun = fichasDe(comunes[0]?.[1] as string);
  const propios = new Map<string, Map<string, string>>();
  const patron = /:root\[data-tema='([a-z-]+)'\]\s*\{([^}]*)\}/g;
  for (const [, tema, cuerpo] of css.matchAll(patron)) {
    if (propios.has(tema as string)) throw new Error(`el tema ${tema} está dos veces`);
    propios.set(tema as string, fichasDe(cuerpo as string));
  }
  const bloques = new Map(
    [...propios].map(([tema, suyas]) => [tema, new Map([...comun, ...suyas])] as const),
  );
  return {
    comun,
    bloques,
    propios,
    resto: css.replace(patronComun, '').replace(patron, '').trim(),
  };
}

/**
 * El valor de una ficha con sus `var(--x)` sustituidas por las del mismo bloque,
 * como hace el navegador: un tema que dice `--chapa-borde: var(--gold)` pinta
 * con su oro. Una referencia a una ficha que el bloque no tiene lanza.
 */
export function resuelta(
  bloque: ReadonlyMap<string, string>,
  ficha: string,
  vistas: string[] = [],
): string {
  if (vistas.includes(ficha))
    throw new Error(`fichas en círculo: ${[...vistas, ficha].join(' → ')}`);
  const valor = bloque.get(ficha);
  if (valor === undefined) throw new Error(`${ficha} no está en el bloque`);
  return valor.replace(/var\((--[a-z0-9-]+)\)/g, (_, otra: string) =>
    resuelta(bloque, otra, [...vistas, ficha]),
  );
}

/** Una declaración de un bloque: `propiedad: valor`, con la línea donde empieza. */
export interface Declaracion {
  readonly propiedad: string;
  readonly valor: string;
  readonly linea: number;
}

/** Un bloque de una hoja: su selector, los de fuera (`@media`…), su línea y lo que declara. */
export interface BloqueCss {
  readonly selector: string;
  readonly padres: readonly string[];
  readonly linea: number;
  readonly declaraciones: readonly Declaracion[];
}

/**
 * Los bloques de una hoja (sin comentarios), con su selector, los de fuera, la
 * línea donde empieza cada uno y sus declaraciones: lo que necesita un guardia que
 * mira qué reglas hay, dónde y qué dicen. Lo que va suelto fuera de todo bloque
 * (un `@import`) no es una declaración.
 */
export function bloquesCss(css: string): BloqueCss[] {
  const bloques: {
    selector: string;
    padres: string[];
    linea: number;
    declaraciones: Declaracion[];
  }[] = [];
  const abiertos: (typeof bloques)[number][] = [];
  let trozo = '';
  let linea = 1;
  let lineaDelTrozo = 1;
  const declarar = (): void => {
    const dentro = abiertos.at(-1);
    const texto = trozo.trim();
    if (dentro === undefined || texto === '') return;
    const dos = texto.indexOf(':');
    dentro.declaraciones.push({
      propiedad: (dos === -1 ? texto : texto.slice(0, dos)).trim(),
      valor: dos === -1 ? '' : texto.slice(dos + 1).trim(),
      linea: lineaDelTrozo,
    });
  };
  for (const c of sinComentariosCss(css)) {
    if (c === '{') {
      const bloque = {
        selector: trozo.trim(),
        padres: abiertos.map((b) => b.selector),
        linea: lineaDelTrozo,
        declaraciones: [],
      };
      bloques.push(bloque);
      abiertos.push(bloque);
      trozo = '';
    } else if (c === '}' || c === ';') {
      declarar();
      if (c === '}') abiertos.pop();
      trozo = '';
    } else {
      if (trozo.trim() === '' && c.trim() !== '') lineaDelTrozo = linea;
      trozo += c;
    }
    if (c === '\n') linea++;
  }
  return bloques;
}
