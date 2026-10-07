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
  /** Solo los puentes (`puente-*`, §17), y todos ellos (`catalogoValidado`). */
  readonly puente?: MedidasDePuente;
}

/**
 * Lo que un puente (`puente-<clase>-<eje>`, §17, #157) sabe de sí mismo, de su
 * guía de geometría: su ancla es el centro del tablero, no la base. Lo llevan
 * al JSON de la pieza `pnpm taller derivar-puentes` (`puenteDerivado`); no se
 * escriben a mano.
 */
export interface MedidasDePuente {
  /** Cuántos píxeles de la imagen mide una casilla: de ahí sale su escala. */
  readonly pxPorCasilla: number;
  /** Cuánto se alza el centro del tablero sobre el suelo, en casillas. */
  readonly altura: number;
  /** De donde un estribo toca el suelo a donde lo toca el otro, en casillas. */
  readonly largo: number;
}

/** Si una pieza es un puente (`puente-piedra-ns`, `puente-troncos-eo`…): lleva sus medidas. */
const esPiezaDePuente = (id: string): boolean => /^puente-(piedra|troncos)-/.test(id);

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
  /**
   * Lo alto de su silueta, de izquierda a derecha: por franja de columnas, la
   * fracción del alto de la imagen donde empieza lo opaco (la más baja de la
   * franja). Solo en las hojas que tapan una cara (`conPerfil`), y en todas
   * ellas: la cara se pinta bajo esta línea (`pintadaDeCara`). Lo deriva de la
   * imagen `pnpm taller catalogo-escena` (`perfilDeModulo`).
   */
  readonly perfil?: readonly number[];
}

/**
 * Si una hoja tapa una cara de acantilado y sus módulos llevan perfil: las
 * paredes, las laderas y el pedregal (`rocas-caidas`).
 */
export const conPerfil = (hoja: string): boolean =>
  /^(paredes|laderas)-/.test(hoja) || hoja === 'rocas-caidas';

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
  /** Las piezas sueltas por id (`puente-piedra-ns`, `atlas/mina`…). */
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

/** Comprueba el perfil de un módulo de `hoja` (`Modulo.perfil`), o lanza diciendo cómo rehacerlo. */
const perfilValidado =
  (hoja: string) =>
  <M extends { readonly nombre: string; readonly perfil?: readonly number[] }>(m: M): M => {
    const donde = `el módulo «${m.nombre}» de «${hoja}»`;
    if (!conPerfil(hoja)) {
      if (m.perfil !== undefined)
        throw new Error(`${donde} trae perfil y su hoja no tapa ninguna cara`);
      return m;
    }
    if (m.perfil === undefined)
      throw new Error(
        `${donde} no trae el perfil de su silueta: rehaz el catálogo (pnpm taller catalogo-escena)`,
      );
    if (m.perfil.length === 0 || !m.perfil.every((v) => Number.isFinite(v) && v >= 0 && v <= 1))
      throw new Error(
        `${donde}: su perfil son fracciones del alto entre 0 y 1, y trae ${JSON.stringify(m.perfil)}`,
      );
    return m;
  };

const esPar = (p: readonly number[]): p is Par =>
  p.length === 2 && p.every((v) => Number.isFinite(v));

/**
 * El catálogo, comprobado: todo módulo de una hoja de laderas trae sus juntas
 * enteras (filo y pie como pares, largo 1 o 2, un papel de la cadena), y ningún
 * otro las trae; todo módulo de una hoja que tapa una cara trae su perfil, de
 * fracciones entre 0 y 1, y ningún otro lo trae; todo puente trae sus medidas,
 * positivas, y ninguna otra pieza las trae. Lanza diciendo qué módulo y qué
 * hacer: sin esto, la falta solo salía al componer el primer mapa con esa ladera.
 */
export function catalogoValidado(c: CatalogoEnBruto): Catalogo {
  const hojas: Record<string, readonly Modulo[]> = {};
  for (const [hoja, ms] of Object.entries(c.hojas))
    hojas[hoja] = ms.map(perfilValidado(hoja)).map(({ ladera, ...m }): Modulo => {
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
  const piezas: Record<string, Pieza> = {};
  for (const [id, p] of Object.entries(c.piezas)) {
    if (!esPiezaDePuente(id)) {
      if (p.puente !== undefined)
        throw new Error(`la pieza «${id}» trae medidas de puente y no es un puente`);
      piezas[id] = p;
      continue;
    }
    const m = p.puente;
    if (m === undefined)
      throw new Error(
        `el puente «${id}» no trae sus medidas (casilla, alto y largo del tablero): derívalas (pnpm taller derivar-puentes) y rehaz el catálogo (pnpm taller catalogo-escena)`,
      );
    for (const k of ['pxPorCasilla', 'altura', 'largo'] as const)
      if (!(Number.isFinite(m[k]) && m[k] > 0))
        throw new Error(`el puente «${id}»: su ${k} es un número positivo, y dice ${m[k]}`);
    piezas[id] = p;
  }
  return { hojas, piezas };
}
