/**
 * El catálogo de la escena: las medidas y el ancla de cada módulo y de cada
 * pieza suelta que el escenógrafo puede colocar. Es lo único que `componer`
 * necesita saber del arte, y lo recibe como dato: así la composición no lee de
 * disco y corre igual en Node que en el navegador.
 *
 * En disco vive en `assets/mapa/escena.json` (`RUTA_DEL_CATALOGO`), y lo rehace
 * `pnpm taller catalogo-escena` desde los JSON de cada hoja y cada pieza. Un test
 * comprueba que el que está en el repo es el que sale del disco.
 *
 * Toda `src` es relativa a `assets/mapa/`.
 */

export interface Pieza {
  readonly src: string;
  /** Tamaño nativo de la imagen, en píxeles. */
  readonly nw: number;
  readonly nh: number;
  /** El ancla: el centro de la base, en píxeles de la imagen. */
  readonly ax: number;
  readonly ay: number;
}

/** Un punto `[x, y]` en píxeles de una imagen. */
export type Par = readonly [number, number];

/** Qué hace un módulo en la cadena de una ladera (§20): rematarla, seguirla o doblar la esquina. */
export const PAPELES_DE_LADERA = ['inicio', 'medio', 'largo', 'fin', 'esquina'] as const;
export type PapelDeLadera = (typeof PAPELES_DE_LADERA)[number];

/**
 * Lo que un módulo de ladera (`laderas-*`, §20, #156) sabe de sí mismo, igual
 * en el índice de su hoja que en el catálogo: dónde caen, en píxeles del
 * módulo, el filo de su junta norte y el pie de su junta sur; cuántas casillas
 * cubre de norte a sur, y su papel en la cadena. `componer` pone el filo en el
 * borde de la casilla alta y saca la escala de lo que hay de uno a otro. Los
 * lleva de la guía al índice `pnpm taller derivar-laderas` (`registrarLadera`);
 * no se escriben a mano.
 */
export interface JuntasDeLadera {
  readonly filo: Par;
  readonly pie: Par;
  readonly largo: 1 | 2;
  readonly papel: PapelDeLadera;
}

export interface Modulo extends Pieza {
  /** El nombre del módulo dentro de su hoja (`1`, `torre-redonda`…). */
  readonly nombre: string;
  /** Solo en las hojas de laderas, y en todas ellas (`catalogoValidado`). */
  readonly ladera?: JuntasDeLadera;
}

/** Un módulo de ladera con sus juntas. */
export type ModuloDeLadera = Modulo & { readonly ladera: JuntasDeLadera };

/**
 * `m` con sus juntas de ladera, o lanza diciendo cómo sacarlas: un índice de
 * hoja de antes de `pnpm taller derivar-laderas`, o un catálogo sin rehacer.
 */
export function moduloDeLadera(m: Modulo, hoja: string): ModuloDeLadera {
  if (m.ladera === undefined)
    throw new Error(
      `el módulo «${m.nombre}» de «${hoja}» no trae sus juntas de ladera: derívalas (pnpm taller derivar-laderas) y rehaz el catálogo (pnpm taller catalogo-escena)`,
    );
  return m as ModuloDeLadera;
}

/** Si una hoja es de laderas (`laderas-<material>-<lado>-<caída>`): sus módulos llevan juntas. */
export const esHojaDeLadera = (hoja: string): boolean =>
  /^laderas-[a-z]+-(este|oeste)-[123]$/.test(hoja);

export interface Catalogo {
  /** Los módulos de cada hoja, de menor a mayor alto de ancla. */
  readonly hojas: Readonly<Record<string, readonly Modulo[]>>;
  /** Las piezas sueltas por id (`nodo-puente-ancho`, `atlas/mina`…). */
  readonly piezas: Readonly<Record<string, Pieza>>;
}

export const RUTA_DEL_CATALOGO = 'assets/mapa/escena.json';

/** Un catálogo vacío: todo sale con su marcador de color. */
export const CATALOGO_VACIO: Catalogo = { hojas: {}, piezas: {} };

/**
 * El catálogo tal como sale de un JSON: los pares son listas, y el papel, texto.
 * Lo que `catalogoValidado` comprueba.
 */
export interface CatalogoEnBruto {
  readonly hojas: Readonly<
    Record<
      string,
      readonly (Omit<Modulo, 'ladera'> & {
        readonly ladera?: {
          readonly filo: readonly number[];
          readonly pie: readonly number[];
          readonly largo: number;
          readonly papel: string;
        };
      })[]
    >
  >;
  readonly piezas: Readonly<Record<string, Pieza>>;
}

const esPar = (p: readonly number[]): p is Par =>
  p.length === 2 && p.every((v) => Number.isFinite(v));

/**
 * El catálogo, comprobado: todo módulo de una hoja de laderas trae sus juntas
 * enteras (filo y pie como pares, largo 1 o 2, un papel de la cadena), y ningún
 * otro las trae. Lanza diciendo qué módulo y qué hacer: sin esto, la falta solo
 * salía al componer el primer mapa con esa ladera.
 */
export function catalogoValidado(c: CatalogoEnBruto): Catalogo {
  const hojas: Record<string, readonly Modulo[]> = {};
  for (const [hoja, ms] of Object.entries(c.hojas))
    hojas[hoja] = ms.map(({ ladera, ...m }): Modulo => {
      if (!esHojaDeLadera(hoja)) {
        if (ladera !== undefined)
          throw new Error(
            `el módulo «${m.nombre}» de «${hoja}» trae juntas de ladera y no es una ladera`,
          );
        return m;
      }
      const donde = `el módulo «${m.nombre}» de «${hoja}»`;
      if (ladera === undefined) return moduloDeLadera(m, hoja);
      const { filo, pie, largo, papel } = ladera;
      if (!esPar(filo) || !esPar(pie))
        throw new Error(
          `${donde}: el filo y el pie son pares [x, y], y trae ${JSON.stringify({ filo, pie })}`,
        );
      if (largo !== 1 && largo !== 2)
        throw new Error(`${donde}: cubre 1 o 2 casillas, y dice ${largo}`);
      if (!(PAPELES_DE_LADERA as readonly string[]).includes(papel))
        throw new Error(
          `${donde}: su papel es uno de ${PAPELES_DE_LADERA.join(', ')}, y dice «${papel}»`,
        );
      return { ...m, ladera: { filo, pie, largo, papel: papel as PapelDeLadera } };
    });
  return { hojas, piezas: c.piezas };
}
