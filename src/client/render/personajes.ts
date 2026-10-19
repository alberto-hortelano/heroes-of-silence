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
 *     `_poses/<juego>-8d/dN-a.png`, `dN-b.png` y, si dispara, `dN-c.png`
 *     (`HOJAS_DE_FIGURA`), con las anclas medidas en
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
import { type Hoja, validarHojas } from '@core/unidad.js';
import { esIdDeUnidad } from '@core/validar.js';
import atlasDePoses from '../../../assets/unidades/_poses/atlas-8d.json';
import {
  type CLIPS_DE_FIGURA,
  CLIPS_OPCIONALES,
  FILAS_DEL_ATLAS,
  hojaDeLaFila,
  JUEGO_POR_DEFECTO,
  NOMBRES_DE_DIRECCION,
} from '../../shared/arte.js';
import type { Direccion } from '../direccion.js';
import type { CharacterAtlas, ClipInfo } from './character.js';

/** Una figura entera: sus ocho direcciones y con qué se escala. */
export interface ArteDeFigura {
  /** Las 8 direcciones, en el orden de `NOMBRES_DE_DIRECCION` (0 de frente). */
  readonly direcciones: readonly CharacterAtlas[];
  /** `false` para el Y Bot: hay que teñirlo, porque no dice qué es. */
  readonly propio: boolean;
  /** Quién es, para decirlo en un aviso: `la unidad <id>` o `el Y Bot «<juego>»`. */
  readonly nombre: string;
  /**
   * Si su arte pinta el disparo (`shoot`) en sus ocho direcciones. Lo pinta el Y
   * Bot de quien dispara; no lo pinta quien golpea, ni el arte pintado antes de
   * que existiera la hoja C, ni el bastón del liche: a esos su `shoot` es su
   * `attack` (`figuraDe`).
   */
  readonly dispara: boolean;
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

/**
 * Una dirección tal como la trae su JSON, comprobada: las seis acciones de toda
 * figura y el disparo solo si lo pinta. `figuraDe` la completa.
 */
export interface DireccionComprobada extends Omit<CharacterAtlas, 'clips'> {
  readonly clips: Readonly<Record<(typeof CLIPS_DE_FIGURA)[number], ClipInfo>> &
    Readonly<Partial<Record<(typeof CLIPS_OPCIONALES)[number], ClipInfo>>>;
  readonly altura: number;
}

const OPCIONAL = new Set<string>(CLIPS_OPCIONALES);

/** La fila de un atlas (`FILAS_DEL_ATLAS`), resuelta a su imagen y a la fila dentro de ella. */
type ImagenDeFila = (fila: number) => { readonly imagen: string; readonly row: number };

/**
 * Un JSON de una dirección, comprobado como atlas de 6 acciones y, si lo trae,
 * el disparo. Lanza diciendo qué le falta: un clip sin ancla pintaría la figura
 * en la esquina sin que nada se pusiera rojo. El del Y Bot se comprueba al
 * importar el módulo, así que un JSON roto rompe el arranque y
 * `personajes.test.ts`, no una batalla a mitad.
 */
export function comoDireccion8d(
  valor: unknown,
  nombre: string,
  imagenDeFila: ImagenDeFila,
): DireccionComprobada {
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
  const clips: Partial<Record<string, ClipInfo>> = {};
  for (const clip of FILAS_DEL_ATLAS) {
    const c = a.clips?.[clip];
    if (c === undefined && OPCIONAL.has(clip)) continue;
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
    // La suelta es del disparo, y solo de él: el ataque es cuerpo a cuerpo. Cae
    // dentro del clip: ni en la primera columna, que sería disparar sin tensar,
    // ni más allá de sus fotogramas. Y un disparo sin ella no sabría cuándo sale
    // el proyectil.
    const { suelta } = c;
    if (clip === 'shoot' && suelta === undefined) {
      throw new Error(`el atlas ${nombre} tiene disparo y no dice en qué columna suelta`);
    }
    if (
      suelta !== undefined &&
      (clip !== 'shoot' || !Number.isInteger(suelta) || suelta < 1 || suelta >= c.frames)
    ) {
      throw new Error(
        `el atlas ${nombre} pone la suelta del clip "${clip}" en la columna ${suelta}: solo el disparo la tiene, entre la 1 y la ${c.frames - 1}`,
      );
    }
    clips[clip] = {
      ...imagenDeFila(c.row),
      frames: c.frames,
      fps: c.fps,
      loop: c.loop,
      anchor: c.anchor,
      ...(suelta === undefined ? {} : { suelta }),
    };
  }
  const frame = a.cadaver?.frame;
  const muerte = clips.death as ClipInfo;
  if (a.cadaver?.clip !== 'death' || typeof frame !== 'number' || frame >= muerte.frames) {
    throw new Error(`el atlas ${nombre} no dice qué fotograma de la muerte es el cadáver`);
  }
  return {
    cell: a.cell,
    columns: a.columns,
    // Las seis de `CLIPS_DE_FIGURA` están: el bucle ha lanzado con la que faltara.
    clips: clips as DireccionComprobada['clips'],
    cadaver: { clip: 'death', frame },
    altura: a.altura,
  };
}

/**
 * Una figura de ocho direcciones ya comprobadas. El disparo, en las ocho o en
 * ninguna: con él en unas sí y en otras no, la figura dispararía según hacia
 * dónde mire. Quien no lo pinta dispara con su ataque: su `shoot` es su
 * `attack`, puesto aquí una vez para que ningún lector de clips tenga que
 * preguntar si está. Quien lo note lo dice el animador (`anim.ts`).
 */
function figuraDe(
  direcciones: readonly DireccionComprobada[],
  propio: boolean,
  nombre: string,
): ArteDeFigura {
  if (direcciones.length !== NOMBRES_DE_DIRECCION.length) {
    throw new Error(
      `${nombre} trae ${direcciones.length} direcciones y una figura tiene ${NOMBRES_DE_DIRECCION.length}: con menos se mezclarían luces de dos artes`,
    );
  }
  const conDisparo = direcciones.filter((d) => d.clips.shoot !== undefined).length;
  if (conDisparo !== 0 && conDisparo !== direcciones.length) {
    const sin = direcciones.flatMap((d, n) => (d.clips.shoot === undefined ? [`d${n}`] : []));
    throw new Error(
      `${nombre} trae el disparo en ${conDisparo} de sus ${direcciones.length} direcciones (le falta en ${sin.join(', ')}): en todas o en ninguna`,
    );
  }
  const completas: CharacterAtlas[] = direcciones.map((d) => ({
    ...d,
    clips: { ...d.clips, shoot: d.clips.shoot ?? d.clips.attack },
  }));
  return {
    direcciones: completas,
    propio,
    nombre,
    dispara: conDisparo > 0,
    alturaPropia: (direcciones[INDICE_DE_HOJA[MIRADA_DE_PRESENTACION]] as DireccionComprobada)
      .altura,
    imagenes: [...new Set(completas.flatMap((d) => FILAS_DEL_ATLAS.map((c) => d.clips[c].imagen)))],
  };
}

/** Los juegos de armas con Y Bot en 8 direcciones: las claves de `atlas-8d.json`. */
export type JuegoDelYBot = keyof typeof atlasDePoses.juegos;

/** El Y Bot de cada juego de armas, con sus 8 direcciones. */
const YBOT: ReadonlyMap<string, ArteDeFigura> = new Map(
  Object.entries(atlasDePoses.juegos as Record<string, unknown[]>).map(([juego, dirs]) => [
    juego,
    figuraDe(
      dirs.map((d, n) =>
        comoDireccion8d(d, `_poses/${juego}-8d/d${n}`, (filaDelAtlas) => {
          const { hoja, fila } = hojaDeLaFila(filaDelAtlas);
          return { imagen: `/unidades/_poses/${juego}-8d/d${n}-${hoja}.png`, row: fila };
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
 * El cuerpo con que se pinta la gente de la base (encargados y vecinos): el Y Bot
 * sin armas y en reposo de civil (`civil`). Su `cuerpo` de `data/vecinos.json`
 * —una criatura de la facción— se queda para cuando haya figuras propias; con
 * el Y Bot de esa criatura, un vecino que habla en la plaza estaba en guardia con
 * el arma en la mano (ajuste tras la vuelta 2 de la base caminable).
 */
export const CUERPO_DE_VECINO = 'vecino-de-la-base';

/**
 * El juego de armas de lo que se pinta **sin hoja de unidad**: el héroe, el
 * personaje y la gente de la base. Las tropas no van aquí: desde el 19-10-2026
 * (F3 de `docs/agents/2026-10-18-combate-y-ejercitos-en-el-juego/`) toda tropa
 * del juego es una unidad del catálogo y se pinta con la hoja de su cuerpo
 * (`hojaDeUnidad`), registrada al arrancar (`registrarLasHojas`). La tabla de
 * criaturas que había aquí murió con `data/creatures.json`.
 */
export const JUEGO_SIN_HOJA: Readonly<Record<string, JuegoDelYBot>> = {
  [HERO_BODY]: 'espada-escudo',
  [CHARACTER_BODY]: 'espada-escudo',
  [CUERPO_DE_VECINO]: 'civil',
};

/**
 * La tabla de cuerpos que se lee al pintar: la del juego y, encima, las hojas de
 * `assets/unidades/` que se registran al arrancar (`registrarLasHojas`: la
 * partida, el espectador y la arena). Una sola tabla: con dos, cada lector de
 * figuras tenía que acordarse de las dos.
 */
const CUERPOS = new Map<string, ArteDeFigura>(
  Object.entries(JUEGO_SIN_HOJA).map(([cuerpo, juego]) => [cuerpo, ybot(juego)]),
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
  if (JUEGO_SIN_HOJA[id] !== undefined) {
    throw new Error(`"${id}" es un cuerpo del juego: una hoja de unidad no lo sustituye`);
  }
  if (!esIdDeUnidad(id)) {
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

/**
 * La figura de un cuerpo (`BattleStack.body`, que es siempre el arte: la hoja de
 * su unidad, `hojaDeUnidad`): la registrada o la de la tabla; y si no, el Y Bot
 * por defecto (la hoja aún no ha llegado, o está a medias en el taller y no se
 * registró).
 */
export function arteDe(body: string): ArteDeFigura {
  return CUERPOS.get(body) ?? ybot(JUEGO_POR_DEFECTO);
}

/**
 * Pide la lista de hojas del taller (`/__arena/hojas`: la sirve `pnpm dev` y la
 * emite `vite build`), la valida y registra cada hoja completa
 * (`registrarUnidad`). La usan la partida, el espectador y la arena: sin ella,
 * una tropa del catálogo se pintaría con el Y Bot por defecto. Una hoja a medias
 * en el taller no se registra (#140): la lista la trae con su motivo, y quien
 * la pide decide cómo decirlo. Devuelve la lista entera.
 */
export async function registrarLasHojas(): Promise<readonly Hoja[]> {
  const r = await fetch('/__arena/hojas');
  if (!r.ok) throw new Error(`no se ha podido leer la lista de hojas (${r.status})`);
  const hojas = validarHojas(await r.json());
  for (const h of hojas) if (h.incompleta === null && !CUERPOS.has(h.id)) registrarUnidad(h.id, h);
  return hojas;
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
