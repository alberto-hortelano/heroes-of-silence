/**
 * Qué figura lleva cada cuerpo: la tabla del arte a 25°, en 8 direcciones.
 *
 * Toda figura tiene 8 direcciones y las 6 acciones (decisión del usuario,
 * 03-10-2026: «la imagen por defecto debería ser el Y Bot, el arte antiguo se
 * elimina»). Dos niveles y un respaldo:
 *
 *  1. **Su arte propio**: una unidad de `assets/unidades/<id>/` con sus ocho
 *     `dN/atlas.webp` (los templarios, hoy). Se registra a demanda
 *     (`registrarUnidad`); no se tiñe, la distingue el aro.
 *  2. **El Y Bot de su juego de armas**: los renders de
 *     `_poses/<juego>-8d/dN-a.png` y `dN-b.png`, con las anclas medidas en
 *     `_poses/atlas-8d.json` (`pnpm taller derivar-poses`). Es el de toda
 *     criatura del catálogo, del héroe y de toda unidad sin `dN`, y se tiñe del
 *     color de su bando porque no dice qué es.
 *  3. **Un marcador de color**, solo si el PNG no ha cargado. El juego se juega
 *     sin arte, y eso tiene test. No hay atlas antiguo al que caer.
 *
 * Las anclas se leen de los JSON derivados, no se transcriben: un ancla copiada
 * a mano es justo lo que se descuadra en silencio.
 */
import { HERO_BODY } from '@core/hero/hero.js';
import { CHARACTER_BODY } from '@core/rpg/character.js';
import atlasDePoses from '../../../assets/unidades/_poses/atlas-8d.json';
import { CLIPS_DE_FIGURA, JUEGO_POR_DEFECTO, NOMBRES_DE_DIRECCION } from '../../shared/arte.js';
import type { Direccion } from '../direccion.js';
import type { CharacterAtlas, ClipInfo } from './character.js';

/** Una figura entera: sus ocho direcciones y con qué se escala. */
export interface ArteDeFigura {
  /** Las 8 direcciones, en el orden de `NOMBRES_DE_DIRECCION` (0 de frente). */
  readonly direcciones: readonly CharacterAtlas[];
  /** `false` para el Y Bot: hay que teñirlo, porque no dice qué es. */
  readonly propio: boolean;
  /** Lo que mide la figura en su propia hoja: para encajarla sola en una miniatura. */
  readonly alturaPropia: number;
  /**
   * Todas sus imágenes, sin repetir: las que comprueba el test en disco. Al
   * pintar no se piden todas: se pide la hoja que se pinta (`figura.ts`).
   */
  readonly imagenes: readonly string[];
}

/**
 * La dirección de vista (`direccion.ts`) de cada hoja, en el orden de las hojas:
 * la n-ésima es la que se llama `NOMBRES_DE_DIRECCION[n]`. El sur es «frente»
 * (hacia la cámara), el este «derecha», el norte «espalda». Es el único sitio
 * que dice ese orden: `INDICE_DE_HOJA` y el «Girar» de la ficha de la arena
 * salen de aquí. Lo ancla `test/camino.test.ts` contra los nombres; que la
 * IMAGEN mire hacia ahí lo dice la captura en diagonal.
 */
export const DIRECCION_DE_HOJA = [
  'S',
  'SE',
  'E',
  'NE',
  'N',
  'NO',
  'O',
  'SO',
] as const satisfies readonly Direccion[];

// Las dos listas tienen que medir lo mismo, y eso lo comprueba `tsc`: una
// dirección de más o de menos aquí no compila.
const _mismaLongitud: (typeof DIRECCION_DE_HOJA)['length'] extends (typeof NOMBRES_DE_DIRECCION)['length']
  ? true
  : never = true;
void _mismaLongitud;

/** La hoja de cada dirección de vista: su posición en `DIRECCION_DE_HOJA`. */
export const INDICE_DE_HOJA = Object.fromEntries(
  DIRECCION_DE_HOJA.map((d, n) => [d, n]),
) as Readonly<Record<Direccion, number>>;

/** La vista con la que se presenta una figura quieta: de frente-derecha. */
export const MIRADA_DE_PRESENTACION: Direccion = 'SE';

/** La fila de un atlas de 6 filas, resuelta a su imagen y a la fila dentro de ella. */
type ImagenDeFila = (fila: number) => { readonly imagen: string; readonly row: number };

/**
 * Un JSON de una dirección, comprobado como atlas de 6 acciones. Lanza diciendo
 * qué le falta: un clip sin ancla pintaría la figura en la esquina sin que nada
 * se pusiera rojo. El del Y Bot se comprueba al importar el módulo, así que un
 * JSON roto rompe el arranque y `personajes.test.ts`, no una batalla a mitad.
 */
export function comoDireccion8d(
  valor: unknown,
  nombre: string,
  imagenDeFila: ImagenDeFila,
): CharacterAtlas & { readonly altura: number } {
  const a = valor as
    | {
        cell?: unknown;
        columns?: unknown;
        altura?: unknown;
        clips?: Record<string, Partial<Omit<ClipInfo, 'imagen'>> | undefined>;
        cadaver?: { clip?: unknown; frame?: unknown };
      }
    | undefined;
  if (a === undefined || typeof a.cell !== 'number' || typeof a.columns !== 'number') {
    throw new Error(`el atlas ${nombre} no dice el tamaño de celda ni las columnas`);
  }
  if (typeof a.altura !== 'number' || !(a.altura > 0)) {
    throw new Error(`el atlas ${nombre} no dice cuánto mide su figura (altura)`);
  }
  const clips = {} as Record<(typeof CLIPS_DE_FIGURA)[number], ClipInfo>;
  for (const clip of CLIPS_DE_FIGURA) {
    const c = a.clips?.[clip];
    if (
      c === undefined ||
      typeof c.row !== 'number' ||
      typeof c.frames !== 'number' ||
      !(c.frames > 0) ||
      typeof c.fps !== 'number' ||
      typeof c.loop !== 'boolean' ||
      c.anchor?.length !== 2
    ) {
      throw new Error(`el atlas ${nombre} no tiene un clip "${clip}" con fotogramas y ancla`);
    }
    clips[clip] = {
      ...imagenDeFila(c.row),
      frames: c.frames,
      fps: c.fps,
      loop: c.loop,
      anchor: c.anchor,
    };
  }
  const frame = a.cadaver?.frame;
  if (a.cadaver?.clip !== 'death' || typeof frame !== 'number' || frame >= clips.death.frames) {
    throw new Error(`el atlas ${nombre} no dice qué fotograma de la muerte es el cadáver`);
  }
  return {
    cell: a.cell,
    columns: a.columns,
    clips,
    cadaver: { clip: 'death', frame },
    altura: a.altura,
  };
}

/** Una figura de ocho direcciones ya comprobadas. */
function figuraDe(
  direcciones: readonly (CharacterAtlas & { readonly altura: number })[],
  propio: boolean,
  nombre: string,
): ArteDeFigura {
  if (direcciones.length !== NOMBRES_DE_DIRECCION.length) {
    throw new Error(
      `${nombre} trae ${direcciones.length} direcciones y una figura tiene ${NOMBRES_DE_DIRECCION.length}: con menos se mezclarían luces de dos artes`,
    );
  }
  return {
    direcciones,
    propio,
    alturaPropia: (direcciones[INDICE_DE_HOJA[MIRADA_DE_PRESENTACION]] as { altura: number })
      .altura,
    imagenes: [
      ...new Set(direcciones.flatMap((d) => CLIPS_DE_FIGURA.map((c) => d.clips[c].imagen))),
    ],
  };
}

/** Las filas 0-2 viven en `dN-a.png` y las 3-5 en `dN-b.png`. */
const FILAS_POR_HOJA = 3;

/** Los juegos de armas con Y Bot en 8 direcciones: las claves de `atlas-8d.json`. */
export type JuegoDelYBot = keyof typeof atlasDePoses.juegos;

/** El Y Bot de cada juego de armas, con sus 8 direcciones. */
const YBOT: ReadonlyMap<string, ArteDeFigura> = new Map(
  Object.entries(atlasDePoses.juegos as Record<string, unknown[]>).map(([juego, dirs]) => [
    juego,
    figuraDe(
      dirs.map((d, n) =>
        comoDireccion8d(d, `_poses/${juego}-8d/d${n}`, (fila) => {
          const hoja = fila < FILAS_POR_HOJA ? 'a' : 'b';
          return {
            imagen: `/unidades/_poses/${juego}-8d/d${n}-${hoja}.png`,
            row: fila % FILAS_POR_HOJA,
          };
        }),
      ),
      false,
      `el Y Bot «${juego}»`,
    ),
  ]),
);

/** Los juegos de armas que tienen Y Bot en 8 direcciones. */
export function juegosDelYBot(): readonly string[] {
  return [...YBOT.keys()];
}

function ybot(juego: string): ArteDeFigura {
  const arte = YBOT.get(juego);
  if (arte === undefined) {
    throw new Error(
      `el juego de armas «${juego}» no tiene poses en 8 direcciones; los hay de ${juegosDelYBot().join(', ')}`,
    );
  }
  return arte;
}

/**
 * El juego de armas de cada cuerpo del juego (decisión del usuario, 03-10-2026):
 * piquero → lanza, caballería → montado-lanza, monje o mago → bastón, y el resto
 * espada y escudo. Arqueros y ballesteros van con espada y escudo hasta que
 * exista un render de arco en 8 direcciones. Cada mejora lleva el de su base.
 * Un test exige una fila por criatura del catálogo: una criatura nueva sin la
 * suya se pone roja en vez de caer al respaldo sin que nadie lo decida. Las
 * claves no las puede comprobar `tsc` —el catálogo es un JSON con una lista, y
 * sus ids llegan como `string`—, pero los valores sí: un juego sin poses no
 * compila.
 */
export const JUEGO_DEL_CUERPO: Readonly<Record<string, JuegoDelYBot>> = {
  [HERO_BODY]: 'espada-escudo',
  [CHARACTER_BODY]: 'espada-escudo',
  peasant: 'espada-escudo',
  archer: 'espada-escudo',
  ranger: 'espada-escudo',
  pikeman: 'lanza',
  veteran_pikeman: 'lanza',
  swordsman: 'espada-escudo',
  master_swordsman: 'espada-escudo',
  cavalry: 'montado-lanza',
  champion: 'montado-lanza',
  paladin: 'espada-escudo',
  crusader: 'espada-escudo',
  skeleton: 'espada-escudo',
  zombie: 'espada-escudo',
  mutant_zombie: 'espada-escudo',
  mummy: 'espada-escudo',
  royal_mummy: 'espada-escudo',
  vampire: 'espada-escudo',
  vampire_lord: 'espada-escudo',
  lich: 'baston',
  power_lich: 'baston',
  bone_dragon: 'espada-escudo',
};

/**
 * La tabla de cuerpos que se lee al pintar: la del juego y, encima, las unidades
 * de `assets/unidades/` que alguien registre —hoy, la arena—. Una sola tabla: con
 * dos, cada lector de figuras tenía que acordarse de las dos.
 */
const CUERPOS = new Map<string, ArteDeFigura>(
  Object.entries(JUEGO_DEL_CUERPO).map(([cuerpo, juego]) => [cuerpo, ybot(juego)]),
);

/**
 * Registra una unidad de `assets/unidades/<id>/`: con sus ocho `dN/atlas.json`,
 * su arte propio; sin ellos (`direcciones: null`), el Y Bot de su juego de
 * armas. Lanza si el id es un cuerpo del juego, si el juego no tiene poses o si
 * no llegan las ocho direcciones: con siete se mezclarían luces de dos artes.
 */
export function registrarUnidad(
  id: string,
  hoja: { readonly juego: string; readonly direcciones: readonly unknown[] | null },
): ArteDeFigura {
  if (JUEGO_DEL_CUERPO[id] !== undefined) {
    throw new Error(`"${id}" es un cuerpo del juego: una hoja de unidad no lo sustituye`);
  }
  if (!/^[a-z0-9-]+$/.test(id)) {
    throw new Error(`"${id}" no es el id de una carpeta de assets/unidades/: minúsculas y guiones`);
  }
  const arte =
    hoja.direcciones === null
      ? ybot(hoja.juego)
      : figuraDe(
          hoja.direcciones.map((d, n) =>
            comoDireccion8d(d, `unidades/${id}/d${n}`, (fila) => ({
              imagen: `/unidades/${id}/d${n}/atlas.webp`,
              row: fila,
            })),
          ),
          true,
          `la unidad ${id}`,
        );
  CUERPOS.set(id, arte);
  return arte;
}

/** La figura de un cuerpo: la registrada o la de la tabla, y si no, el Y Bot por defecto. */
export function arteDe(body: string): ArteDeFigura {
  return CUERPOS.get(body) ?? ybot(JUEGO_POR_DEFECTO);
}

/** El atlas de la dirección en la que mira la figura. No se espeja nunca. */
export function hojaDe(arte: ArteDeFigura, mira: Direccion): CharacterAtlas {
  return arte.direcciones[INDICE_DE_HOJA[mira]] as CharacterAtlas;
}

/**
 * Las ocho hojas de la figura, de la de `mira` a la de la espalda, alternando a
 * un lado y a otro: el respaldo de una dirección cuya imagen aún no ha llegado
 * es la más parecida que ya esté, no el marcador.
 */
export function hojasPorCercania(arte: ArteDeFigura, mira: Direccion): CharacterAtlas[] {
  const n = arte.direcciones.length;
  const i = INDICE_DE_HOJA[mira];
  const orden = [i];
  for (let k = 1; k <= n / 2; k++) {
    orden.push((i + k) % n);
    if (k < n / 2) orden.push((i - k + n) % n);
  }
  return orden.map((j) => arte.direcciones[j] as CharacterAtlas);
}
