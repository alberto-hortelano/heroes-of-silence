/**
 * Los juegos de armas del maniquí Y Bot: los perfiles de las hojas de referencia
 * (`PERFILES`), el atrezo de cada arma (`Atrezo`), los juegos a pie
 * (`JUEGOS_DE_ARMAS`) y los montados (`JUEGOS_MONTADOS`), lo que se lee de uno (con
 * qué dispara, `clipDeDisparoDe`; con qué pelea de cerca, `cuerpoACuerpoDe`) y las
 * carpetas donde quedan sus poses y los maniquíes propios de las unidades.
 *
 * Son tablas: sin three, sharp ni playwright, que es lo que piden casi todos los que
 * leen las poses (el taller, los tests). El render está en `render.ts`. Vivían en
 * `tools/art/poses.ts` con él (H4 de la reorganización, 08-11-2026).
 */
import { join } from 'node:path';
import { RAIZ } from '../../comun/raiz.js';
import type { ClipDeDisparo } from '../ybot-a-distancia.js';

export const DIR_POSES = join(RAIZ, 'assets/unidades/_poses');

/**
 * Un perfil es qué clip de Mixamo hace de ataque. Reposo y marcha son los
 * mismos para todos: misma cámara y misma escala en las tres filas.
 */
export const PERFILES = {
  'espada-escudo': { ataque: 'quick', describe: 'golpe corto de espada con escudo' },
  'dos-manos': { ataque: 'heavy', describe: 'tajo amplio con las dos manos' },
  baston: { ataque: 'casting', describe: 'lanzamiento con el brazo extendido' },
  arco: { ataque: 'bow', describe: 'tensar y soltar un arco' },
  ballesta: {
    ataque: 'crossbow',
    describe:
      'encarar y disparar un arma a la altura del hombro (ballesta, arcabuz o culebrina de mano)',
  },
} as const;
export type Perfil = keyof typeof PERFILES;

/**
 * El atrezo de un juego de armas, en metros: un arma de mano (la espada y todo
 * lo que se empuña como ella), un arco o una ballesta. La clave dice cuál es
 * (`'arco' in a`), y cada rama lleva solo lo suyo: al arco no se le aplican las
 * reglas de inclinación de la hoja ni el agarre a dos manos.
 */
export type Atrezo = AtrezoDeMano | AtrezoDeArco | AtrezoDeBallesta | AtrezoDeGranada;

/**
 * El arma con la que quien dispara pelea cuerpo a cuerpo: la del clip `attack`
 * (decisión del usuario, 04-10-2026). `describe` es lo que se le dice al pintor
 * en la hoja B; `atrezo`, lo que lleva el maniquí en ese clip, que reemplaza al
 * arma de tiro mientras dura.
 */
export interface CuerpoACuerpo {
  readonly describe: string;
  readonly atrezo: AtrezoDeMano;
}

/** El arma de la mano derecha. `agarre`: dónde queda la guarda sobre el puño. */
export interface AtrezoDeMano {
  /**
   * El arma de la mano derecha, en metros: la hoja (o el asta) sale por el lado
   * del índice desde `agarre`, y el puño queda hacia el meñique.
   */
  readonly espada: {
    readonly largo: number;
    readonly guarda: number;
    readonly puño: number;
    readonly agarre: number;
    readonly grosor?: number;
    /** Radio de una bola en la punta (maza, mayal). */
    readonly cabeza?: number;
    /** Largo de una punta de lanza. */
    readonly moharra?: number;
    /** Lo que remata la punta: la cruz del báculo, la esfera del mago o la hoja de la alabarda. */
    readonly remate?: 'cruz' | 'esfera' | 'hacha';
  };
  readonly escudo: boolean;
  /** Una rodela redonda de este radio en vez del escudo de cometa. */
  readonly rodela?: number;
  /** Una daga en la mano izquierda, de este largo de hoja. */
  readonly daga?: { readonly largo: number };
  /** Un libro en la mano izquierda. */
  readonly libro?: boolean;
  /**
   * Una granada de mano en la izquierda: una bola con la mecha asomando por
   * arriba, en metros. Desaparece al soltarla en el disparo y rueda al suelo al morir.
   */
  readonly granada?: {
    readonly radio: number;
    /** Lo que asoma la mecha por arriba. */
    readonly mecha: number;
  };
  /** La mano izquierda también en el puño de la espada. */
  readonly dosManos: boolean;
  /** Cuánto apunta la hoja, como mínimo, hacia donde mira (coseno). */
  readonly adelanteMinimo: number;
  /** Cuánto apunta, como mínimo, hacia arriba (coseno): un bastón va de pie. */
  readonly arribaMinimo?: number;
  /** A dos manos: cuánto se lleva el agarre a la línea central del cuerpo (0 a 1). */
  readonly centrado: number;
  /** A dos manos: a cuántos metros por delante del pecho queda el agarre, como mínimo. */
  readonly alcanceMinimo: number;
  /** A dos manos: distancia entre las dos manos sobre el puño, en metros. */
  readonly separacionManos: number;
  /** A dos manos: cuánto se abren los codos hacia fuera, frente a hacia abajo (1 = 45°). */
  readonly codosAfuera: number;
  /** A dos manos: cuánto se adelantan los codos (en la misma escala). */
  readonly codosAdelante: number;
  /** A dos manos: a qué fracción de su largo, como mucho, se estira cada brazo. */
  readonly estiramiento: number;
}

/** Un arco en la mano IZQUIERDA; la derecha, vacía, tensa la cuerda al disparar. */
export interface AtrezoDeArco {
  readonly arco: {
    /** De punta a punta, en recto. */
    readonly largo: number;
    /** Cuánto se curvan las palas hacia la cuerda. */
    readonly combadura: number;
    readonly grosor: number;
  };
  /** La aljaba a la espalda. */
  readonly aljaba: boolean;
  /** El largo de la flecha que se ve en la cuerda mientras se tensa. */
  readonly flecha: number;
  /**
   * En el disparo, cuánto apunta la panza del arco, como mínimo, hacia donde
   * mira (coseno): con la cuerda floja las manos están juntas y su línea es de lado.
   */
  readonly panzaAdelanteMinimo: number;
  /** Fuera del disparo, cuánto apunta, como mínimo, en vertical (coseno). */
  readonly arribaMinimo: number;
  readonly cuerpoACuerpo: CuerpoACuerpo;
}

/** Una ballesta en la mano DERECHA; al disparar, la izquierda sujeta el tablero. */
export interface AtrezoDeBallesta {
  readonly ballesta: {
    /** Tablero por delante del agarre, hasta el arco transversal. */
    readonly delante: number;
    /** Tablero por detrás del agarre: la culata. */
    readonly atras: number;
    /** De punta a punta del arco transversal; 0, un arma de fuego sin arco. */
    readonly palas: number;
    /** Cuánto se curva el arco transversal hacia atrás. */
    readonly combadura: number;
    readonly grosor: number;
  };
  /** Al disparar: a cuántos metros por delante de la derecha sujeta la izquierda. */
  readonly separacionManos: number;
  /** Fuera del disparo: cuánto apunta hacia el suelo, en radianes bajo la horizontal. */
  readonly bajaEnReposo: number;
  readonly cuerpoACuerpo: CuerpoACuerpo;
}

/**
 * El granadero (decisión del usuario, 31-10-2026: «usa la de espada para todo
 * menos para lanzar la bomba»): el sable en la DERECHA y la granada en la
 * IZQUIERDA en todas sus hojas, también en el ataque; en el disparo la izquierda
 * la lanza y desaparece al soltarla. Su arma de cuerpo a cuerpo es él mismo: con
 * ella en la mano desde el reposo, el ataque no cambia de atrezo.
 */
export interface AtrezoDeGranada extends AtrezoDeMano {
  readonly granada: NonNullable<AtrezoDeMano['granada']>;
  readonly cuerpoACuerpo: CuerpoACuerpo;
}

/**
 * Las referencias de Mixamo por juego de armas: el rig `y_bot` con los clips del
 * pack de espada y escudo (no hay otros en la máquina) y el atrezo de cada arma.
 * Cada juego se renderiza una vez en `assets/unidades/_poses/<juego>-8d/` y lo
 * reutilizan todas las unidades que lleven esas armas; uno nuevo se hace
 * copiando el más parecido y retocándolo.
 */
/** Lo que no usa un arma de una mano: los ajustes del agarre a dos manos, a cero. */
export const UNA_MANO = {
  escudo: false,
  dosManos: false,
  adelanteMinimo: 0,
  centrado: 0,
  alcanceMinimo: 0,
  separacionManos: 0,
  codosAfuera: 0,
  codosAdelante: 0,
  estiramiento: 1,
} as const;

/**
 * Las armas de mano de los tiradores (la tabla del usuario, 04-10-2026). Una
 * hoja recta con guarda, como las espadas ya aprobadas: el pintor cambia la
 * forma por la del personaje (`PAPELES.pose`), el maniquí dice dónde va la mano
 * y hacia dónde apunta el filo.
 */
export const DAGA: CuerpoACuerpo = {
  describe: 'una daga corta en la mano derecha',
  atrezo: {
    espada: { largo: 0.3, guarda: 0.1, puño: 0.1, agarre: 0.06, grosor: 0.012 },
    ...UNA_MANO,
  },
};
export const ESPADA_CORTA: CuerpoACuerpo = {
  describe: 'una espada corta de una mano en la derecha',
  atrezo: {
    espada: { largo: 0.6, guarda: 0.16, puño: 0.13, agarre: 0.07, grosor: 0.018 },
    ...UNA_MANO,
  },
};
export const SABLE: CuerpoACuerpo = {
  describe: 'un sable de una mano en la derecha',
  atrezo: {
    espada: { largo: 0.8, guarda: 0.14, puño: 0.14, agarre: 0.07, grosor: 0.016 },
    ...UNA_MANO,
  },
};

/** El sable con la granada en la izquierda: el granadero lo lleva en todas sus hojas. */
const SABLE_Y_GRANADA = { ...SABLE.atrezo, granada: { radio: 0.08, mecha: 0.07 } } as const;

export const JUEGOS_DE_ARMAS = {
  'espada-escudo': {
    describe: 'espada de una mano y escudo de cometa',
    ataque: 'precise',
    // La guardia quieta de `idle (4)`, la de 22 unidades y del juego de dos manos:
    // la de `idle` se movía mucho (04-11-2026, decisión del usuario: «queda muy
    // mal»), y se retiró de todas partes (`CLIPS_RETIRADOS`).
    reposo: 'idle4',
    // El templario con escudo se aprobó con el maniquí gris (su procedencia
    // apunta aquel render); el caballero, que lo reutiliza, ya va con color.
    piernasDeColor: true,
    atrezo: {
      espada: { largo: 0.85, guarda: 0.2, puño: 0.17, agarre: 0.085 },
      escudo: true,
      dosManos: false,
      adelanteMinimo: 0,
      centrado: 0,
      alcanceMinimo: 0,
      separacionManos: 0,
      codosAfuera: 0,
      codosAdelante: 0,
      estiramiento: 1,
    },
  },
  // Los clips son de espada y escudo: la mano izquierda se lleva al puño con IK
  // en cada fotograma. El ataque es el golpe limpio de `precise`: el tajo amplio
  // (`heavy`) clavaba la espada hacia abajo y la hacía bailar (visor del maniquí,
  // 30-10-2026); y como todos los que daban el golpe corto (`quick`), que solo lo
  // amagaba.
  'dos-manos': {
    describe: 'espada larga empuñada con las dos manos',
    ataque: 'precise',
    // La guardia de `idle` gira torso y cabeza a media animación y, de frente, el
    // modelo de imagen lo exageraba hasta enseñar la espalda. `idle (4)` es una
    // guardia quieta con la espada vertical (elegida entre las cuatro del pack).
    reposo: 'idle4',
    piernasDeColor: true,
    atrezo: {
      espada: { largo: 1.1, guarda: 0.3, puño: 0.3, agarre: 0.05 },
      escudo: false,
      dosManos: true,
      adelanteMinimo: 0.5,
      centrado: 0.85,
      alcanceMinimo: 0.3,
      separacionManos: 0.11,
      codosAfuera: 4,
      codosAdelante: 0.7,
      estiramiento: 0.7,
    },
  },
  // Bastón o báculo rematado en cruz, en la derecha: el monje y el abad. El
  // ataque es el lanzamiento con el brazo extendido del perfil `baston`.
  baston: {
    describe: 'bastón alto rematado en cruz en la mano derecha',
    ataque: 'casting',
    reposo: 'idle4',
    piernasDeColor: true,
    atrezo: {
      espada: { largo: 1.15, guarda: 0, puño: 0.5, agarre: 0, grosor: 0.024, remate: 'cruz' },
      ...UNA_MANO,
      arribaMinimo: 0.85,
    },
  },
  // Lanza de infantería en la derecha, sin escudo: el escudero.
  lanza: {
    describe: 'lanza en la mano derecha, sin escudo',
    ataque: 'precise',
    reposo: 'idle4',
    piernasDeColor: true,
    atrezo: {
      espada: { largo: 1.45, guarda: 0, puño: 0.6, agarre: 0, grosor: 0.02, moharra: 0.25 },
      ...UNA_MANO,
      adelanteMinimo: 0.6,
    },
  },
  // Maza de una mano en la derecha y un libro en la izquierda: el inquisidor.
  maza: {
    describe: 'maza de una mano en la derecha y un libro en la izquierda',
    ataque: 'precise',
    reposo: 'idle4',
    piernasDeColor: true,
    atrezo: {
      espada: { largo: 0.42, guarda: 0, puño: 0.14, agarre: 0, grosor: 0.025, cabeza: 0.07 },
      ...UNA_MANO,
      libro: true,
    },
  },
  // Mayal de una mano: mango corto y la bola de pinchos al final de la cadena,
  // que en el maniquí va rígida. El ataque es el tajo amplio.
  mayal: {
    describe: 'mayal de bola de pinchos en la mano derecha',
    ataque: 'heavy',
    reposo: 'idle4',
    piernasDeColor: true,
    atrezo: {
      espada: { largo: 0.55, guarda: 0, puño: 0.16, agarre: 0, grosor: 0.012, cabeza: 0.08 },
      ...UNA_MANO,
    },
  },
  // Arco en la izquierda y la derecha vacía, con la aljaba a la espalda: los
  // arqueros. El disparo son las poses de tensar y soltar de `POSE_A_DISTANCIA`;
  // el ataque, la daga con el golpe corto de espada, sin el arco (decisión del
  // usuario, 04-10-2026); el reposo, la guardia quieta de `idle (4)`, como todo
  // juego sin escudo.
  arco: {
    describe: 'arco en la mano izquierda y aljaba a la espalda',
    ataque: 'precise',
    disparo: 'bow',
    reposo: 'idle4',
    piernasDeColor: true,
    atrezo: {
      arco: { largo: 1.25, combadura: 0.12, grosor: 0.018 },
      aljaba: true,
      flecha: 0.7,
      panzaAdelanteMinimo: 0.7,
      arribaMinimo: 0.8,
      cuerpoACuerpo: DAGA,
    },
  },
  // Ballesta en la derecha: el ballestero. Al disparar se la sube al hombro; de
  // cerca, espada corta. Quien dispara otra arma al hombro (arcabuz, culebrina,
  // rifle) lleva su propio maniquí sin arco (`maniqui` en `tools/taller/unidades.ts`).
  ballesta: {
    describe: 'ballesta en la mano derecha',
    ataque: 'precise',
    disparo: 'crossbow',
    reposo: 'idle4',
    piernasDeColor: true,
    atrezo: {
      ballesta: { delante: 0.5, atras: 0.2, palas: 0.6, combadura: 0.08, grosor: 0.025 },
      separacionManos: 0.24,
      bajaEnReposo: 0.5,
      cuerpoACuerpo: ESPADA_CORTA,
    },
  },
  // El granadero (04-10-2026): el sable en la derecha y la granada en la
  // izquierda en todas las hojas (31-10-2026: con la granada sola en la
  // derecha, el sable era solo texto y el pintor ponía una u otro). El disparo
  // arma la izquierda por encima del hombro y lanza (`grenade` en
  // `POSE_A_DISTANCIA`); de cerca, el sable, con la granada aún en la izquierda.
  granada: {
    describe:
      'sable de una mano en la derecha y granada de mano en la izquierda, que lanza por encima del hombro',
    ataque: 'precise',
    disparo: 'grenade',
    reposo: 'idle4',
    piernasDeColor: true,
    atrezo: {
      ...SABLE_Y_GRANADA,
      cuerpoACuerpo: { describe: SABLE.describe, atrezo: SABLE_Y_GRANADA },
    },
  },
  // Sin armas: la gente de la base (ajuste tras la vuelta 2 de la base caminable,
  // 09-10-2026). Todos los demás reposos son guardias con el arma en la mano, y
  // un vecino que habla en la plaza en guardia se leía como un soldado. El reposo
  // y la marcha son los de ambiente de Mixamo; el ataque, el golpe corto sin nada
  // en la mano (un vecino no pelea, pero la hoja B es de toda figura).
  civil: {
    describe: 'sin armas, con las manos vacías: un vecino de la villa',
    ataque: 'quick',
    reposo: 'reposo_civil',
    marcha: 'andar_civil',
    piernasDeColor: true,
    atrezo: null,
  },
} as const satisfies Record<
  string,
  {
    describe: string;
    /** El clip del ataque, que es siempre cuerpo a cuerpo. */
    ataque: string;
    /** Solo quien dispara: el clip del disparo (hoja C) y su curva (`CURVAS_DEL_DISPARO`). */
    disparo?: ClipDeDisparo;
    reposo: string;
    /** El clip de la marcha, si no es la de espada y escudo. */
    marcha?: string;
    piernasDeColor: boolean;
    /** `null`: sin nada en las manos. */
    atrezo: Atrezo | null;
  }
>;
export type JuegoDeArmas = keyof typeof JUEGOS_DE_ARMAS;

/**
 * Un juego de armas con poses en 8 direcciones: los de sprite-forge y la
 * montura, que sale de `tools/art/montura.ts --8d` y no está en
 * `JUEGOS_DE_ARMAS`.
 */
export type JuegoEn8d = JuegoDeArmas | JuegoMontado;

/**
 * Los jinetes, que salen de `tools/art/montura.ts --8d` y no de
 * `JUEGOS_DE_ARMAS`: con qué pelean de cerca —el tajo de espada desde la silla,
 * los tres— y, quien dispara, con qué curva (`CURVAS_DEL_DISPARO`) y cuánto dura
 * el disparo, que no sale de un clip de Mixamo. La clave es `montado-<arma>`, y
 * esa arma es la que `montura.ts` pone en la mano (`ArmaMontada`, `--<arma>`).
 */
export const JUEGOS_MONTADOS: Readonly<
  Record<
    'montado-lanza' | 'montado-pistola' | 'montado-arco',
    {
      readonly cuerpoACuerpo: string;
      readonly disparo?: ClipDeDisparo;
      /** En segundos; solo quien dispara. */
      readonly duracionDelDisparo?: number;
    }
  >
> = {
  'montado-lanza': {
    cuerpoACuerpo: 'una espada de una mano, con un tajo desde la silla',
  },
  'montado-pistola': {
    cuerpoACuerpo: 'una espada de una mano, con un tajo desde la silla',
    disparo: 'pistol',
    duracionDelDisparo: 1,
  },
  // El jinete elfo (decisión del usuario, 05-10-2026): arco, espada y lanza para
  // la carga. Tensa y suelta con la curva del arquero a pie, así que suelta en
  // la misma columna; el arco es el atrezo de `JUEGOS_DE_ARMAS.arco`.
  'montado-arco': {
    cuerpoACuerpo: 'una espada de una mano, con un tajo desde la silla',
    disparo: 'bow',
    duracionDelDisparo: 1,
  },
};
export type JuegoMontado = keyof typeof JUEGOS_MONTADOS;

const esMontado = (j: JuegoEn8d): j is JuegoMontado => j in JUEGOS_MONTADOS;

/** La carpeta de las poses en 8 direcciones de un juego de armas, la montura incluida. */
export const carpetaDePoses = (j: JuegoEn8d): string => join(DIR_POSES, `${j}-8d`);

/** El clip del disparo de un juego (arco, ballesta, granada, pistola); `null` si no dispara. */
export function clipDeDisparoDe(j: JuegoEn8d): ClipDeDisparo | null {
  if (esMontado(j)) return JUEGOS_MONTADOS[j].disparo ?? null;
  const juego: { readonly ataque: string; readonly disparo?: ClipDeDisparo } = JUEGOS_DE_ARMAS[j];
  return juego.disparo ?? null;
}

/**
 * Con qué pelea cuerpo a cuerpo quien dispara, para decírselo al pintor de su
 * hoja B; `null` si no dispara. El atrezo es el de su maniquí, si tiene uno
 * propio, o el de su juego; el de un jinete está en `JUEGOS_MONTADOS`, porque su
 * tajo de espada lo pinta `montura/escena.js`.
 */
export function cuerpoACuerpoDe(j: JuegoEn8d, maniqui?: Atrezo): string | null {
  if (clipDeDisparoDe(j) === null) return null;
  if (esMontado(j)) return JUEGOS_MONTADOS[j].cuerpoACuerpo;
  return armaDeManoDe(j, maniqui ?? JUEGOS_DE_ARMAS[j].atrezo).describe;
}

/**
 * Si quien dispara sigue llevando su arma de tiro mientras golpea cuerpo a
 * cuerpo: el granadero, con la granada en la izquierda y el sable en la derecha.
 * Lo que lleva su maniquí en el ataque, para que el pintor no la quite.
 */
export function golpeaConLaGranada(j: JuegoEn8d, maniqui?: Atrezo): boolean {
  if (clipDeDisparoDe(j) === null || esMontado(j)) return false;
  return armaDeManoDe(j, maniqui ?? JUEGOS_DE_ARMAS[j].atrezo).atrezo.granada !== undefined;
}

/** El arma de mano del atrezo de un tirador; lanza si no la lleva. */
export function armaDeManoDe(j: JuegoDeArmas, atrezo: Atrezo | null): CuerpoACuerpo {
  if (atrezo === null || !('cuerpoACuerpo' in atrezo)) {
    throw new Error(
      `el juego «${j}» dispara y su atrezo no lleva arma de cuerpo a cuerpo (\`cuerpoACuerpo\`): su ataque no tendría con qué pintarse`,
    );
  }
  return atrezo.cuerpoACuerpo;
}

/**
 * El maniquí propio de una unidad: el de su juego de armas con el atrezo
 * cambiado para que se parezca a lo que lleva (decisión del usuario,
 * 04-10-2026: el Y Bot no es sagrado; si lleva daga, el palo se acorta).
 */
export const DIR_MANIQUIES = join(DIR_POSES, 'unidades');
export const carpetaDeManiqui = (id: string): string => join(DIR_MANIQUIES, `${id}-8d`);
/** Dónde guarda `pnpm taller maniqui <id> --fotogramas` los fotogramas enteros de cada clip. */
export const carpetaDeFotogramas = (id: string): string => join(RAIZ, '.cache/taller/maniqui', id);
