/**
 * Qué figura lleva cada cuerpo: la tabla del arte a 25°.
 *
 * Tres niveles, y el orden lo decidió el usuario (01-10-2026):
 *
 *  1. **Atlas propio**: los cuerpos que tienen personaje aprobado en la rama
 *     `archivo/gpt-rpg` —Liora, Doran, la guardia y Nara—, con reposo y marcha de
 *     su hoja y el ataque de `combat-actions` cuando lo hay.
 *  2. **El maniquí Y Bot** (`liora-poses-v3`): toda unidad sin atlas propio. Es
 *     la base de la que salen los personajes, a la misma cámara, y se tiñe del
 *     color de su bando. Nada de los sprites de perfil de `assets/generated`:
 *     mezclados con figuras a 25° parecían de otro juego.
 *  3. **Un marcador de color**, solo si el PNG no ha cargado. El juego se juega
 *     sin arte, y eso tiene test.
 *
 * Las hojas se leen de los JSON que acompañan a cada PNG en la rama, no se
 * transcriben: un ancla copiada a mano es justo lo que se descuadra en silencio.
 */
import { HERO_BODY } from '@core/hero/hero.js';
import { CHARACTER_BODY } from '@core/rpg/character.js';
import liora from '../../../assets/characters/liora/atlas.json';
import ybot from '../../../assets/characters/y-bot-reference/liora-poses-v3.json';
import combate from '../../../assets/rpg/scenes/combat-actions-v1.json';
import companeros from '../../../assets/rpg/scenes/companions-v3.json';
import guardia from '../../../assets/rpg/scenes/guards-v3.json';
import { FIGURA } from '../../shared/arte.js';
import { type HojaDeUnidad, hojaDeUnidad, type NombreDeArte } from './assets.js';
import type { CharacterAtlas, CharacterClip, ClipObligatorio } from './character.js';

/** Una hoja: la imagen que hay que pedirle a `assets.ts` y cómo se corta. */
interface Hoja {
  /**
   * El nombre con el que se carga: uno de la tabla `ARTE_RPG` de `assets.ts`, o
   * una hoja de `assets/unidades/` (`unidad/<id>`), que se carga a demanda.
   */
  readonly imagen: NombreDeArte | HojaDeUnidad;
  readonly atlas: CharacterAtlas;
  /**
   * Cuánto mide la figura dentro de su celda, en píxeles de la hoja: de la
   * coronilla a los pies en el primer fotograma de reposo. Cada hoja encuadra
   * distinto —el maniquí ocupa 147 de 256 y Doran 215— y sin esta cifra un
   * espadachín salía el doble de alto que un campesino del mismo tablero.
   * Medido sobre el canal alfa de cada PNG (umbral 40), no estimado.
   */
  readonly altura: number;
}

interface ArteDeCuerpo {
  /** Reposo y marcha, y ataque si no hay `ataque`. */
  readonly base: Hoja;
  /** El ataque de `combat-actions`, que está en otra hoja. */
  readonly ataque?: Hoja;
  /** `false` para el maniquí: hay que teñirlo, porque no dice qué es. */
  readonly propio: boolean;
  /**
   * Lo que mide la figura en su propia hoja, si es una de `assets/unidades/`:
   * para encajarla sola en una miniatura, donde no se compara con nadie.
   */
  readonly alturaPropia?: number;
}

const CLIPS: readonly ClipObligatorio[] = ['idle', 'walk', 'attack'];

/**
 * Un JSON de la rama, comprobado como atlas. Lanza diciendo qué le falta: un
 * clip sin ancla pintaría la figura en la esquina sin que nada se pusiera rojo.
 * Se comprueba al importar el módulo, así que un JSON roto rompe el arranque y
 * el test de `personajes.test.ts`, no una batalla a mitad.
 *
 * `charge` no es obligatorio, pero si la hoja lo trae se mira igual: un clip de
 * carga roto se pintaría justo en la jugada que más se mira.
 */
export function comoAtlas(valor: unknown, nombre: string): CharacterAtlas {
  const a = valor as Partial<CharacterAtlas> | undefined;
  if (a === undefined || typeof a.cell !== 'number' || typeof a.columns !== 'number') {
    throw new Error(`el atlas ${nombre} no dice el tamaño de celda ni las columnas`);
  }
  const opcionales: readonly CharacterClip[] = a.clips?.charge === undefined ? [] : ['charge'];
  for (const clip of [...CLIPS, ...opcionales]) {
    const c = a.clips?.[clip];
    if (c === undefined || !(c.frames > 0) || c.anchor?.length !== 2) {
      throw new Error(`el atlas ${nombre} no tiene un clip "${clip}" con fotogramas y ancla`);
    }
  }
  return a as CharacterAtlas;
}

function deHojaCompartida(
  meta: { readonly characters: Readonly<Record<string, unknown>> },
  id: string,
  imagen: NombreDeArte,
  altura: number,
): Hoja {
  const fila = meta.characters[id];
  if (fila === undefined) throw new Error(`la hoja ${imagen} no tiene al personaje "${id}"`);
  return { imagen, atlas: comoAtlas(fila, `${imagen}/${id}`), altura };
}

/**
 * El maniquí, traducido de su formato de `sprite-forge` al de `character.ts`.
 *
 * Su JSON no trae anclas —las anclas son cosa del recorte, no del render—, así
 * que se fijan aquí: los pies caen en (133, 216) de cada celda de 256, medido
 * sobre la hoja. `quick` es el golpe, y su séptima celda repite la sexta.
 */
const ANCLA_YBOT: readonly [number, number] = [133, 216];
function filaYbot(clip: string): number {
  const fila = ybot.clips.findIndex((c) => c.clip === clip);
  if (fila < 0) throw new Error(`el maniquí no tiene el clip "${clip}"`);
  return fila;
}
export const MANIQUI: Hoja = {
  imagen: 'ybot',
  altura: 147,
  atlas: {
    cell: ybot.cell,
    columns: ybot.columns,
    clips: {
      idle: { row: filaYbot('idle'), frames: 7, fps: 3, loop: true, anchor: ANCLA_YBOT },
      walk: { row: filaYbot('walk'), frames: 7, fps: 8, loop: true, anchor: ANCLA_YBOT },
      attack: { row: filaYbot('quick'), frames: 6, fps: 10, loop: false, anchor: ANCLA_YBOT },
    },
  },
};

const LIORA: Hoja = { imagen: 'liora', atlas: comoAtlas(liora, 'liora'), altura: 163 };

/** Las alturas medidas de cada personaje en su hoja de reposo y en la de golpes. */
const ALTURA: Readonly<Record<string, { readonly base: number; readonly golpe: number }>> = {
  nara: { base: 183, golpe: 158 },
  doran: { base: 215, golpe: 168 },
  'guard-0': { base: 212, golpe: 174 },
};

function alturaDe(id: string): { readonly base: number; readonly golpe: number } {
  const a = ALTURA[id];
  if (a === undefined) throw new Error(`falta medir la altura de "${id}" en su hoja`);
  return a;
}

/**
 * Un personaje de una hoja compartida (compañeros o guardia), con su golpe en la
 * hoja de `combat-actions`, que es donde están los ataques de todos.
 */
function deHojaConGolpe(
  meta: { readonly characters: Readonly<Record<string, unknown>> },
  imagen: 'companeros' | 'guardia',
  id: string,
): ArteDeCuerpo {
  return {
    base: deHojaCompartida(meta, id, imagen, alturaDe(id).base),
    ataque: deHojaCompartida(combate, id, 'combate', alturaDe(id).golpe),
    propio: true,
  };
}

const DORAN = deHojaConGolpe(companeros, 'companeros', 'doran');
const NARA = deHojaConGolpe(companeros, 'companeros', 'nara');
const GUARDIA = deHojaConGolpe(guardia, 'guardia', 'guard-0');

/**
 * Los cuerpos con atlas propio. Cada mejora lleva el arte de su base: es la
 * misma figura con mejor equipo, y el nombre la distingue en el panel.
 */
export const ARTE_POR_CUERPO: Readonly<Record<string, ArteDeCuerpo>> = {
  [CHARACTER_BODY]: { base: LIORA, propio: true },
  // El héroe, en el mapa y en el tablero (fase 1b): la misma figura de Liora
  // (decisión del usuario); lo distingue el aro o el bando de su dueño.
  [HERO_BODY]: { base: LIORA, propio: true },
  swordsman: DORAN,
  master_swordsman: DORAN,
  archer: NARA,
  ranger: NARA,
  pikeman: GUARDIA,
  veteran_pikeman: GUARDIA,
};

const DEL_MANIQUI: ArteDeCuerpo = { base: MANIQUI, propio: false };

/**
 * La tabla de cuerpos que se lee al pintar: la del juego de arriba y, encima,
 * las hojas de `assets/unidades/` que alguien registre —hoy, la arena, que pide
 * el `atlas.json` de cada hoja—. Una sola tabla y una sola lista de hojas
 * derivada de ella: con dos, cada lector de figuras tenía que acordarse de las
 * dos. El juego no registra ninguna —ninguna criatura del catálogo lleva esos
 * ids, y registrar un cuerpo del juego lanza—, así que lo que pinta no cambia.
 */
const CUERPOS = new Map<string, ArteDeCuerpo>(Object.entries(ARTE_POR_CUERPO));

function hojasDe(cuerpos: Iterable<ArteDeCuerpo>): readonly (NombreDeArte | HojaDeUnidad)[] {
  return [
    ...new Set(
      [...cuerpos, DEL_MANIQUI].flatMap((a) =>
        a.ataque === undefined ? [a.base.imagen] : [a.base.imagen, a.ataque.imagen],
      ),
    ),
  ];
}

/**
 * Las hojas de todas las figuras, recalculadas al registrar y no al pintar: con
 * una sola cargada ya hay alguien que respira, y el lienzo lo pregunta en cada
 * fotograma.
 */
let hojasDeFiguraActuales = hojasDe(CUERPOS.values());

export function hojasDeFigura(): readonly (NombreDeArte | HojaDeUnidad)[] {
  return hojasDeFiguraActuales;
}

/**
 * Registra la hoja de una unidad con su `atlas.json`, comprobado por `comoAtlas`
 * (incluida la celda de 384 y el `charge` del jinete).
 *
 * **En el tablero se escala con la altura de un adulto (`FIGURA.alturaAdulto`) y
 * no con la de la hoja.** El `altura` medido de cada hoja es lo que ocupa SU
 * figura, y escalar por él igualaría a todas: el goblin (121 px) saldría tan alto
 * como el ent (193) y el jinete (288) como un soldado a pie. Todas las hojas del
 * taller se dibujan a la misma escala —un adulto, 160 px de celda—, así que con
 * esa cifra cada una conserva su tamaño, que es lo que hace el taller al
 * enseñarlas (`tools/taller/vista.ts`). La de la hoja se guarda aparte
 * (`alturaPropia`): es la que encaja una figura sola en su miniatura.
 */
export function registrarHojaDeUnidad(id: string, atlasJson: unknown): void {
  if (ARTE_POR_CUERPO[id] !== undefined) {
    throw new Error(`"${id}" es un cuerpo del juego: una hoja de unidad no lo sustituye`);
  }
  const atlas = comoAtlas(atlasJson, `unidades/${id}`);
  const altura = (atlasJson as { altura?: unknown }).altura;
  if (typeof altura !== 'number' || !(altura > 0)) {
    throw new Error(`el atlas unidades/${id} no dice cuánto mide su figura (altura)`);
  }
  CUERPOS.set(id, {
    base: { imagen: hojaDeUnidad(id), atlas, altura: FIGURA.alturaAdulto },
    propio: true,
    alturaPropia: altura,
  });
  hojasDeFiguraActuales = hojasDe(CUERPOS.values());
}

/** La figura de un cuerpo: la suya si la tiene, o el maniquí. */
export function arteDe(body: string): ArteDeCuerpo {
  return CUERPOS.get(body) ?? DEL_MANIQUI;
}

/** La hoja que toca para un clip: el ataque sale de su hoja si la tiene. */
export function hojaPara(arte: ArteDeCuerpo, clip: CharacterClip): Hoja {
  return clip === 'attack' && arte.ataque !== undefined ? arte.ataque : arte.base;
}
