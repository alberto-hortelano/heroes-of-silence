/**
 * Los clips de Mixamo del maniquí Y Bot: cuáles se eligen y con qué FBX
 * (`archivoDeClip`, los que se añaden a los de sprite-forge en `ANIMS_EXTRA`), las
 * ocho direcciones con que se renderiza una unidad (`OCHO_DIRECCIONES`), lo que cambia
 * de ellos el maniquí de una unidad (`ClipsDeManiqui`), cómo se reparten los
 * fotogramas de un clip en las columnas de una hoja (`indicesDeClip`,
 * `indicesDeTramo`, `fpsATiempoReal`, `columnaDeSuelta`) y las filas de cada hoja
 * de un juego (`hojasDe`).
 *
 * Tablas y cuentas: sin three, sharp ni playwright. Vivían en `tools/art/poses.ts`
 * con el render (H4 de la reorganización, 08-11-2026).
 */
import {
  type ClipDeFigura,
  FIGURA,
  FIGURA_8D,
  HOJAS_DE_FIGURA,
  type HojaDeFigura,
  hojasDeFigura,
} from '../../../src/shared/arte.js';
import { type ClipDeDisparo, DISPARO_EN_NODE, esDisparo } from '../ybot-a-distancia.js';
import { clipDeDisparoDe, JUEGOS_DE_ARMAS, type JuegoDeArmas } from './juegos.js';

/** El FBX de recibir daño: la fila `hurt` y la pose de la que arranca la muerte. */
const CLIP_DE_DAÑO = 'anims/sword_and_shield/sword and shield impact (3).fbx';

/** Las animaciones que se le añaden al set de sprite-forge, además de las suyas. */
export const ANIMS_EXTRA = [
  // Recibir daño: de los tres `impact` del pack, el (3) es el que se lee a 160 px
  // (retrocede girando el torso); el primero es un respingo casi quieto.
  { id: 'impact3', file: CLIP_DE_DAÑO },
  // Los otros reposos del pack, para los juegos de armas a los que la guardia de
  // lado de `idle` no les sirve.
  { id: 'idle2', file: 'anims/sword_and_shield/sword and shield idle (2).fbx' },
  { id: 'idle3', file: 'anims/sword_and_shield/sword and shield idle (3).fbx' },
  { id: 'idle4', file: 'anims/sword_and_shield/sword and shield idle (4).fbx' },
  {
    id: 'casting',
    file: 'anims/sword_and_shield/sword and shield casting.fbx',
  },
  // De pie y relajado, con el arma colgando y un balanceo lento del peso: el
  // reposo genérico de Mixamo, para quien no está en guardia (el vampiro).
  { id: 'idle_neutral', file: 'mixamo/ambient_anims/idle_neutral.fbx' },
  // El resto del catálogo de donde cada unidad elige sus acciones
  // (`ClipsDeManiqui.acciones`, 10-10-2026): reposos de ambiente y del pack,
  // marchas y carreras (con su desplazamiento congelado, como `walk` y `run`),
  // ataques, golpes y muertes. Fuera los ataques que dan pasos (`attack`,
  // `attack (2)`, `(3)`, `slash (2)`): se salen de la celda.
  { id: 'idle_breathing', file: 'mixamo/ambient_anims/idle_breathing.fbx' },
  { id: 'idle_look_around', file: 'mixamo/ambient_anims/idle_look_around.fbx' },
  { id: 'block_idle', file: 'anims/sword_and_shield/sword and shield block idle.fbx' },
  // Sin `walk (2)` ni `run (2)` del pack: andan y corren HACIA ATRÁS (el pie de apoyo
  // va hacia donde mira el cuerpo; lo midió la revisión de animaciones con el
  // esqueleto del maniquí, 30-10-2026). Diez unidades andaban y 26 cargaban de espaldas.
  { id: 'walking', file: 'mixamo/ambient_anims/walking.fbx', locomotion: true },
  { id: 'slash4', file: 'anims/sword_and_shield/sword and shield slash (4).fbx' },
  { id: 'kick', file: 'anims/sword_and_shield/sword and shield kick.fbx' },
  { id: 'casting2', file: 'anims/sword_and_shield/sword and shield casting (2).fbx' },
  { id: 'power_up', file: 'anims/sword_and_shield/sword and shield power up.fbx' },
  { id: 'impact2', file: 'anims/sword_and_shield/sword and shield impact (2).fbx' },
  { id: 'death2', file: 'anims/sword_and_shield/sword and shield death (2).fbx' },
  // El arco no tiene clip de Mixamo: el FBX solo da la postura y los brazos los
  // coloca `POSE_A_DISTANCIA` fotograma a fotograma.
  { id: 'bow', file: 'anims/sword_and_shield/sword and shield attack (4).fbx' },
  { id: 'crossbow', file: 'anims/sword_and_shield/sword and shield attack (4).fbx' },
  { id: 'grenade', file: 'anims/sword_and_shield/sword and shield attack (4).fbx' },
  // El reposo y la marcha de quien no lleva armas (`civil`): los clips de ambiente
  // del rig de Mixamo, no los del pack de espada y escudo, que van en guardia.
  { id: 'reposo_civil', file: 'mixamo/ambient_anims/idle_neutral.fbx' },
  { id: 'andar_civil', file: 'mixamo/ambient_anims/walking.fbx', locomotion: true },
];

/** Fotogramas de un clip renderizado, repartidos en las columnas de la hoja. */
export function indicesDeClip(total: number, columnas: number, enBucle: boolean): number[] {
  if (total <= 0) throw new Error(`un clip sin fotogramas no se puede muestrear (${total})`);
  return Array.from({ length: columnas }, (_, i) =>
    enBucle
      ? Math.floor((i * total) / columnas)
      : Math.round((i * (total - 1)) / Math.max(1, columnas - 1)),
  );
}

/**
 * La unidad definitiva: 8 direcciones y 6 acciones, y la séptima, el disparo,
 * en quien dispara. Cada dirección se reparte en las hojas de `HOJAS_DE_FIGURA`:
 * dos de 3 filas, que es el tamaño que ChatGPT pinta bien, y la C de una sola
 * fila para el disparo. No se espeja ninguna dirección: con la luz fija a la
 * izquierda, espejar la traería de la derecha.
 */
export const OCHO_DIRECCIONES = {
  /** A 6 fps la carrera da 4 fotogramas para 7 columnas: se repetirían. */
  fps: 12,
  /** El cadáver cae hacia la cámara y en 256 se sale por abajo. */
  celda: FIGURA_8D.celda,
  encuadre: { ortho: FIGURA_8D.ortho, objetivo: FIGURA_8D.objetivo },
  /**
   * El alto del maniquí de pie en la hoja, en píxeles: el Y Bot mide 1,8047 m y
   * a 25° se ve por `cos 25°`. Es el mismo en las 8 direcciones (la cámara es
   * ortográfica), y es contra él contra lo que se escala. Medido por la caja del
   * reposo salía más alto de espaldas, con la espada asomando sobre la cabeza,
   * y el personaje pintado quedaba más pequeño.
   */
  altoDelManiqui: Math.round(
    (1.8047 * Math.cos((FIGURA.camara.elevacionGrados * Math.PI) / 180) * FIGURA_8D.celda) /
      FIGURA_8D.ortho,
  ),
  /**
   * El clip de Mixamo de las acciones que son iguales en todo juego, y cuáles
   * se muestrean en bucle. El reposo, el ataque y el disparo los pone cada juego
   * de armas (`hojasDe`).
   */
  anims: { walk: 'walk', charge: 'run', hurt: 'impact3', death: 'death' },
  enBucle: ['idle', 'walk', 'charge'] as readonly ClipDeFigura[],
} as const;

/** Una fila de una hoja de pose: qué acción es, con qué clip de Mixamo y si es bucle. */
export interface FilaDePose {
  readonly clip: ClipDeFigura;
  readonly anim: string;
  readonly enBucle: boolean;
  /** El trozo del clip que se muestrea, en segundos; sin él, el clip entero. */
  readonly tramo?: Tramo;
  /** Ida y vuelta por el trozo (`indicesDeTramo`): solo en un bucle. */
  readonly vaiven?: true;
}

/** Las acciones cuyo clip elige la unidad, además del reposo; el disparo lo coloca `POSE_A_DISTANCIA`. */
type AccionElegible = 'walk' | 'charge' | 'attack' | 'hurt' | 'death';

/** Los clips que se pueden elegir: los de `ANIMS_EXTRA` y los de sprite-forge que no son de ambiente. */
const ARCHIVO_DE_SPRITE_FORGE: Readonly<Record<string, string>> = {
  walk: 'anims/sword_and_shield/sword and shield walk.fbx',
  run: 'anims/sword_and_shield/sword and shield run.fbx',
  quick: 'anims/sword_and_shield/sword and shield attack (4).fbx',
  heavy: 'anims/sword_and_shield/sword and shield slash.fbx',
  medium: 'anims/sword_and_shield/sword and shield slash (5).fbx',
  defensive: 'anims/sword_and_shield/sword and shield block.fbx',
  precise: 'anims/sword_and_shield/sword and shield slash (3).fbx',
  hit_react: 'anims/sword_and_shield/sword and shield impact.fbx',
  death: 'anims/sword_and_shield/sword and shield death.fbx',
  wounded_idle: 'mixamo/ambient_anims/wounded_idle.fbx',
};

/**
 * Los clips que no se eligen más, con el porqué: `idle`, la guardia de espada y
 * escudo del pack, gira el torso y la cabeza y se mueve mucho (04-11-2026, decisión
 * del usuario: «elimina este idle de todas partes porque queda muy mal»).
 */
const CLIPS_RETIRADOS: Readonly<Record<string, string>> = {
  idle: 'la guardia de espada y escudo se mueve demasiado: usa idle4, idle_neutral o idle_breathing',
};

/** El FBX de un clip elegible; lanza con uno que no existe, que sprite-forge no pintaría. */
export function archivoDeClip(id: string): string {
  const retirado = CLIPS_RETIRADOS[id];
  if (retirado !== undefined) throw new Error(`el clip «${id}» se retiró: ${retirado}`);
  const archivo =
    ARCHIVO_DE_SPRITE_FORGE[id] ?? ANIMS_EXTRA.find((a) => a.id === id && !esDisparo(a.id))?.file;
  if (archivo === undefined) throw new Error(`no hay clip de Mixamo «${id}» que elegir`);
  return archivo;
}

export interface ArchivosDeDañoYMuerte {
  readonly daño: string;
  readonly muerte: string;
}

/** Los FBX de las filas del daño y la muerte de un maniquí: los suyos o los de siempre. */
export function archivosDeDañoYMuerte(clips: ClipsDeManiqui = {}): ArchivosDeDañoYMuerte {
  return {
    daño: archivoDeClip(clips.acciones?.hurt ?? 'impact3'),
    muerte: archivoDeClip(clips.acciones?.death ?? 'death'),
  };
}

/** `[desde, hasta]` en segundos del clip de Mixamo, los dos incluidos. */
export type Tramo = readonly [number, number];

/**
 * Lo que el maniquí de una unidad cambia de los clips de su juego, cuando el
 * clip entero no le sirve (el vampiro, 10-10-2026: la guardia de `idle` saca la
 * espada al costado a mitad del bucle y la muerte se pasa medio clip de pie
 * agitando el brazo antes de caer; el modelo de imagen lo copiaba tal cual).
 */
export interface ClipsDeManiqui {
  /** El clip de Mixamo del reposo, en vez del de su juego. */
  readonly reposo?: string;
  /**
   * El clip de las demás acciones, en vez del de su juego (10-10-2026: cada
   * personaje se mueve a su manera). Ids de sprite-forge o de `ANIMS_EXTRA`;
   * el golpe y la muerte cambian el FBX de sus filas (`archivosDeDañoYMuerte`).
   */
  readonly acciones?: Partial<Record<AccionElegible, string>>;
  /**
   * El trozo de cada clip que se muestrea en sus siete columnas. El de la muerte
   * mueve también el fundido desde el final del daño a su `desde`, para que su
   * primera columna siga siendo la última del daño.
   */
  readonly tramos?: Partial<Record<ClipDeFigura, Tramo>>;
  /**
   * Los bucles que se muestrean de ida y vuelta: un trozo que no acaba donde
   * empieza saltaría al volver a la primera columna (el reposo del vampiro,
   * 10-10-2026: la guardia quieta de `idle (4)` solo respira y, pintada, era
   * una estatua; el arranque de `idle` se mueve lo justo pero no cierra).
   */
  readonly vaiven?: readonly ClipDeFigura[];
}

/**
 * Los fotogramas de un tramo de un clip renderizado a `fps`, repartidos en las
 * columnas como `indicesDeClip`. Lanza si el tramo se sale del clip o no tiene
 * dos fotogramas: callado, se muestrearía otra cosa. En `vaiven`, la columna
 * va y vuelve como una onda triangular, del primer fotograma del tramo al
 * último y de vuelta (en 7 columnas, 0 ⅓ ⅔ 1 1 ⅔ ⅓): la última enlaza con la
 * primera sin salto.
 */
export function indicesDeTramo(
  total: number,
  fps: number,
  tramo: Tramo | undefined,
  columnas: number,
  enBucle: boolean,
  vaiven = false,
): number[] {
  const [desde, hasta] =
    tramo === undefined
      ? [0, total - 1]
      : (tramo.map((t) => Math.round(t * fps)) as [number, number]);
  if (desde < 0 || hasta > total - 1 || hasta - desde < 1) {
    throw new Error(
      `el tramo [${tramo?.join(', ')}] s no cabe en un clip de ${total} fotogramas a ${fps} fps (${((total - 1) / fps).toFixed(2)} s)`,
    );
  }
  if (!vaiven) return indicesDeClip(hasta - desde + 1, columnas, enBucle).map((i) => i + desde);
  if (!enBucle) throw new Error('solo un bucle se muestrea de ida y vuelta');
  const onda = (i: number) => 1 - Math.abs(1 - (2 * i) / columnas);
  const cima = onda(Math.floor(columnas / 2));
  return Array.from(
    { length: columnas },
    (_, i) => desde + Math.round(((hasta - desde) * onda(i)) / cima),
  );
}

/**
 * Los fps a los que una fila de pose se ve a la velocidad de su clip de Mixamo,
 * renderizado a `fpsDelRender` en `fotogramas`: sus columnas entre los segundos
 * que cubren. Un bucle cubre una vuelta: el clip entero, su tramo entero
 * (`indicesDeTramo` reparte sus fotogramas sin repetir el primero) o, en
 * vaivén, la ida y la vuelta. Lo demás, de su primera columna a la última.
 * Redondeado a 0,1.
 */
export function fpsATiempoReal(
  fila: Pick<FilaDePose, 'enBucle' | 'tramo' | 'vaiven'> & { readonly indices: readonly number[] },
  fotogramas: number,
  fpsDelRender: number,
): number {
  const { indices, tramo } = fila;
  const columnas = indices.length;
  const primero = Math.min(...indices);
  const ultimo = Math.max(...indices);
  const enTramo =
    tramo === undefined
      ? fotogramas
      : Math.round(tramo[1] * fpsDelRender) - Math.round(tramo[0] * fpsDelRender) + 1;
  // Los fotogramas del render que dura una vuelta, o el clip de punta a punta.
  const dura = fila.vaiven ? 2 * (ultimo - primero) : fila.enBucle ? enTramo : ultimo - primero;
  const pasos = fila.enBucle ? columnas : columnas - 1;
  if (!(dura > 0)) throw new Error(`una fila sin duración: ${indices.join(', ')}`);
  return Math.round((10 * pasos * fpsDelRender) / dura) / 10;
}

/**
 * Las hojas de un juego de armas, en el reparto de `HOJAS_DE_FIGURA`: la A y la
 * B siempre, la C solo si dispara. Cada fila con el clip que le pone el juego.
 */
export function hojasDe(
  j: JuegoDeArmas,
  clips: ClipsDeManiqui = {},
): Partial<Record<HojaDeFigura, FilaDePose[]>> {
  const juego: {
    readonly reposo: string;
    readonly marcha?: string;
    readonly ataque: string;
    readonly disparo?: string;
  } = JUEGOS_DE_ARMAS[j];
  for (const id of [juego.reposo, clips.reposo, ...Object.values(clips.acciones ?? {})])
    if (id !== undefined) archivoDeClip(id);
  const anims: Partial<Record<ClipDeFigura, string>> = {
    ...OCHO_DIRECCIONES.anims,
    idle: clips.reposo ?? juego.reposo,
    ...(juego.marcha === undefined ? {} : { walk: juego.marcha }),
    attack: juego.ataque,
    ...(clips.acciones?.walk === undefined ? {} : { walk: clips.acciones.walk }),
    ...(clips.acciones?.charge === undefined ? {} : { charge: clips.acciones.charge }),
    ...(clips.acciones?.attack === undefined ? {} : { attack: clips.acciones.attack }),
    ...(juego.disparo === undefined ? {} : { shoot: juego.disparo }),
  };
  const fila = (clip: ClipDeFigura): FilaDePose => {
    const anim = anims[clip];
    if (anim === undefined)
      throw new Error(`el juego «${j}» no dice con qué clip se pinta «${clip}»`);
    const tramo = clips.tramos?.[clip];
    return {
      clip,
      anim,
      enBucle: OCHO_DIRECCIONES.enBucle.includes(clip),
      ...(tramo === undefined ? {} : { tramo }),
      ...(clips.vaiven?.includes(clip) ? { vaiven: true as const } : {}),
    };
  };
  return Object.fromEntries(
    hojasDeFigura(clipDeDisparoDe(j) !== null).map((h) => [h, HOJAS_DE_FIGURA[h].map(fila)]),
  );
}

/**
 * La primera columna de la fila del disparo (`shoot`) en la que ya ha soltado:
 * la misma `indicesDeClip` que reparte los fotogramas del render en las
 * columnas y la misma curva con la que el maniquí deja de pintar la flecha. La
 * escribe `pnpm taller derivar-poses` en `atlas-8d.json` (`suelta`) y el
 * cliente suelta ahí el proyectil. Lanza si la cuerda no llega a soltarse.
 */
export function columnaDeSuelta(clip: ClipDeDisparo, fotogramas: number, columnas: number): number {
  const col = indicesDeClip(fotogramas, columnas, false).findIndex(
    (f) => !DISPARO_EN_NODE.cuerdaTensa(clip, DISPARO_EN_NODE.progresoDelDisparo(f, fotogramas)),
  );
  if (col <= 0) {
    throw new Error(
      `el disparo «${clip}» en ${fotogramas} fotogramas y ${columnas} columnas no tiene columna de suelta (${col}): o nunca suelta o ya empieza suelto`,
    );
  }
  return col;
}

/** Los clips que enseña el muestrario por defecto: todo lo elegible, por acción. */
export const CANDIDATOS_DEL_MUESTRARIO: readonly string[] = [
  // reposo (sin `idle`: `CLIPS_RETIRADOS`)
  'idle2',
  'idle3',
  'idle4',
  'idle_neutral',
  'idle_breathing',
  'idle_look_around',
  'block_idle',
  'wounded_idle',
  // marcha y carrera
  'walk',
  'walking',
  'run',
  // ataque
  'quick',
  'heavy',
  'medium',
  'precise',

  'slash4',
  'kick',
  'casting',
  'casting2',
  'power_up',
  // golpe y muerte
  'hit_react',
  'impact2',
  'impact3',
  'death',
  'death2',
];
