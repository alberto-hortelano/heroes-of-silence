/**
 * Un encargo del taller: qué imagen se pide, con qué referencias y adónde va.
 *
 * El prompt que viaja a Codex NO lo escribe quien encola entero: el encargo
 * trae la descripción del contenido, y el taller le antepone el papel de cada
 * referencia y le pospone las reglas del tipo (rejilla, cámara, fondo). Así los
 * acuerdos de arte —«la imagen 1 es la referencia de pose, la 2 la identidad
 * del personaje», cámara a 25°, nunca de perfil— se dicen siempre y con esas
 * palabras, en vez de depender de que cada encargo se acuerde.
 */
import { z } from 'zod';
import { FIGURA } from '../../src/shared/arte.js';
import { NOMBRES_DE_DIRECCION } from './direcciones.js';

/** Lo que cada referencia aporta, y nada más. */
export const PAPELES = {
  pose: 'es la REFERENCIA DE POSE: el maniquí Y Bot renderizado con cámara ortográfica elevada 25 grados. Manda en la cámara, la anatomía, la escala y el movimiento de cada celda. Copia cada pose articulación por articulación',
  identidad:
    'es la IDENTIDAD DEL PERSONAJE: define su aspecto (cara, ropa, armadura, armas, colores) y su acabado pintado. No determina la cámara, la anatomía ni la pose',
  // Sin hablar de su cámara: unas referencias de estilo están de frente (las
  // láminas de `assets/art/`) y otras a 25° (la muestra del mapa). La cámara la
  // dice cada encargo; aquí decirla mentía a la mitad de ellos.
  estilo:
    'es la referencia de ESTILO: el acabado pintado, los materiales y la paleta que hay que seguir. No copies su contenido ni su composición',
} as const;
export type Papel = keyof typeof PAPELES;

/**
 * La rejilla de una lámina de iconos según cuántos lleva: hasta cuatro, una
 * fila; más, filas de cuatro (y entonces tienen que ser múltiplo de cuatro).
 */
export function rejillaDeIconos(n: number): { filas: number; columnas: number } {
  if (n >= 1 && n <= 4) return { filas: 1, columnas: n };
  if (n > 4 && n % 4 === 0) return { filas: n / 4, columnas: 4 };
  throw new Error(`una lámina de ${n} iconos no cabe en una rejilla: hasta 4, o múltiplos de 4`);
}
/** Un efecto animado son 6 fotogramas en 3 columnas por 2 filas. */
export const REJILLA_DE_EFECTO = { columnas: 3, filas: 2 } as const;

const ruta = z
  .string()
  .min(1)
  .refine((r) => !r.startsWith('/') && !r.includes('..'), {
    message: 'la ruta va relativa a la raíz del repo y sin «..»',
  });

const referencia = z.object({ ruta, papel: z.enum(['pose', 'identidad', 'estilo']) });

export const encargoSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'el id va en kebab-case'),
    tipo: z.enum(['identidad', 'giro', 'atlas', 'imagen', 'iconos', 'efecto']),
    /** El contenido: quién es, qué lleva. Las reglas de cámara y fondo las pone el taller. */
    descripcion: z.string().min(20),
    referencias: z.array(referencia),
    /** Ruta de salida SIN extensión: el taller escribe `.webp` (o `.png`) y `.procedencia.json`. */
    salida: ruta,
    /** Atlas: altura de la figura en su celda. Por defecto, la de un adulto. */
    alturaObjetivo: z.number().int().min(60).max(360).optional(),
    /** Atlas: lado de la celda. 256 para las figuras a pie; 384 para las montadas, que no caben. */
    celda: z.union([z.literal(256), z.literal(384)]).optional(),
    /** Atlas: 3 filas (reposo, marcha, ataque) o 4 las monturas (con la carga antes del ataque). */
    filas: z.union([z.literal(3), z.literal(4)]).optional(),
    /** Imagen: si el fondo se recorta o la imagen es opaca (un fondo de batalla). */
    fondo: z.enum(['transparente', 'opaco']).default('transparente'),
    /** Corrige una generación anterior en su mismo hilo de Codex, que conserva la identidad. */
    reanudar: z.object({ hilo: z.string().uuid(), correccion: z.string().min(10) }).optional(),
    /**
     * Atlas de una unidad en 8 direcciones: cuál de las 8 y qué hoja. La A es
     * quieto, andando y carga; la B, ataque, daño y muerte.
     */
    ocho: z
      .object({ direccion: z.number().int().min(0).max(7), hoja: z.enum(['a', 'b']) })
      .optional(),
    /** Iconos: el nombre de cada uno, en el orden de lectura de la lámina de 4×4. */
    nombres: z.array(z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)).optional(),
  })
  .superRefine((e, ctx) => {
    if (e.tipo === 'iconos') {
      try {
        rejillaDeIconos(e.nombres?.length ?? 0);
      } catch (err) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: (err as Error).message });
      }
    }
    const papeles = e.referencias.map((r) => r.papel);
    if (
      e.tipo === 'atlas' &&
      !e.reanudar &&
      (papeles[0] !== 'pose' || papeles[1] !== 'identidad')
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'un atlas lleva primero la referencia de pose y después la identidad del personaje (y quizá un estilo)',
      });
    }
    // La lámina de identidad a 25° se dibuja sobre el maniquí: su primera
    // referencia es la pose. Puede llevar un concepto como identidad (una lámina
    // frontal que solo dice el aspecto) y un estilo.
    if ((e.tipo === 'identidad' || e.tipo === 'giro') && !e.reanudar && papeles[0] !== 'pose') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'una lámina de identidad lleva primero la referencia de pose',
      });
    }
  });
export type Encargo = z.infer<typeof encargoSchema>;

const NUMERALES = ['1', '2', '3', '4', '5'];

/** «La imagen 1 es…, la imagen 2 es…»: el papel de cada adjunto, en su orden. */
export function prefacioDeReferencias(referencias: Encargo['referencias']): string {
  return referencias
    .map((r, i) => `La imagen ${NUMERALES[i] ?? i + 1} ${PAPELES[r.papel]}.`)
    .join('\n');
}

/**
 * La luz es la del contrato (`ARTE.luz`): desde la izquierda y del lado de la
 * cámara. La sombra en el suelo la pone el juego con la silueta de la figura,
 * así que no se pinta.
 */
const SIN_FONDO =
  'Fondo con alfa real totalmente transparente: sin suelo, sin sombra pintada, sin halo, sin brillo, sin rejilla y sin texto. Iluminación desde arriba a la izquierda y por delante, del lado del espectador: la cara visible del personaje está iluminada y las sombras propias caen hacia la derecha y hacia el fondo. Sin contraluz.';

/** Lo que pinta cada fila de una hoja de 8 direcciones. */
const FILAS_OCHO = {
  a: 'Fila 1: las siete poses de reposo de la fila 1 de la referencia de pose. Fila 2: las siete fases de marcha de la fila 2, con apoyo y paso alternando pierna cercana y lejana y los brazos en oposición. Fila 3: las siete fases de la CARGA de la fila 3: corriendo al ataque con el escudo por delante y la espada lista. Cada fila copia su fila de la referencia, articulación por articulación.',
  b: 'Fila 1: las siete poses de ATAQUE de la fila 1 de la referencia de pose, golpeando con la espada. Fila 2: las siete poses de RECIBIR DAÑO de la fila 2: encaja un golpe y retrocede. Fila 3: las siete poses de la MUERTE de la fila 3: la primera es EXACTAMENTE la última de la fila 2, luego se desploma, y la última es el cadáver tendido e inmóvil en el suelo, con sus armas caídas a su lado. Cada fila copia su fila de la referencia, articulación por articulación.',
} as const;

function reglasDeAtlas(e: Encargo): string {
  const { columnas } = FIGURA;
  const filas = e.filas ?? 3;
  const altura = e.alturaObjetivo ?? FIGURA.alturaAdulto;
  const mira =
    e.ocho === undefined
      ? 'El personaje mira a la derecha y al frente como el maniquí.'
      : `El personaje mira hacia donde mira el maniquí (dirección «${NOMBRES_DE_DIRECCION[e.ocho.direccion]}» vista desde la cámara), en todas las celdas: copia su orientación, no la de la identidad.`;
  return [
    `Hoja de sprites de EXACTAMENTE ${columnas} columnas por ${filas} filas, ${columnas * filas} figuras del MISMO personaje, separadas con holgura y sin tocarse.`,
    e.ocho !== undefined
      ? FILAS_OCHO[e.ocho.hoja]
      : filas === 4
        ? 'Fila 1: las siete poses de reposo de la fila 1 de la referencia de pose. Fila 2: las siete fases del paso de la fila 2. Fila 3: las siete fases de la CARGA de la fila 3, el mismo paso con la lanza bajada hacia delante. Fila 4: las siete poses del ATAQUE de la fila 4, parado y golpeando con la espada, sin lanza. Cada fila copia su fila de la referencia, articulación por articulación.'
        : 'Fila 1: las siete poses de reposo de la fila 1 de la referencia de pose. Fila 2: las siete fases de marcha de la fila 2, con apoyo y paso alternando pierna cercana y lejana y los brazos en oposición. Fila 3: las siete poses de ataque de la fila 3.',
    `Misma cámara ortográfica elevada 25 grados en todas las filas, viendo la coronilla y los dos hombros; NUNCA de perfil ni a la altura de los ojos: aunque el personaje mire de lado, se le ve desde arriba. ${mira}`,
    `Misma escala en todas las celdas: la figura de pie ocupa unos ${altura} de cada ${e.celda ?? FIGURA.celda} píxeles de alto. Todo el personaje y su arma caben dentro de su celda con margen.`,
    // Once de los primeros 52 atlas fallaron por lo mismo: en el ataque, la
    // lanza o la espada de una figura tocaba a la de al lado, y el taller no
    // puede separar dos figuras que se tocan. Se pide de entrada.
    'Deja al menos 40 píxeles de aire libre entre una figura y la siguiente en las tres filas. Ningún arma invade la celda vecina: si una lanza, pica, espada o maza extendida no cabe, recoge el brazo o inclina el arma hacia arriba.',
    SIN_FONDO,
  ].join('\n');
}

function reglasDeIdentidad(): string {
  return [
    'UN solo personaje, de cuerpo entero, en la primera pose de reposo de la referencia de pose (de pie o montado, como esté el maniquí).',
    'Cámara ortográfica elevada 25 grados, viendo la coronilla y los hombros; NUNCA de perfil. Mira a la derecha y al frente.',
    'Lámina de identidad: el equipo, los colores y los materiales se leen con claridad. Formato cuadrado, el personaje centrado con margen.',
    SIN_FONDO,
  ].join('\n');
}

function reglasDeGiro(): string {
  const orden = NOMBRES_DE_DIRECCION.map((n, i) => `${i + 1}. ${n}`).join(', ');
  return [
    'Lámina de GIRO de EXACTAMENTE 4 columnas por 2 filas: el MISMO personaje ocho veces, de cuerpo entero, en la pose de reposo, separadas con holgura y sin tocarse.',
    `Cada figura copia la orientación y la pose del maniquí de su celda en la referencia de pose. En orden de lectura miran hacia: ${orden}. Las que van de espaldas enseñan la espalda del personaje: invéntala coherente con su equipo (la capa o sobrevesta por detrás, la cara interior del escudo, la vaina).`,
    'Cámara ortográfica elevada 25 grados en todas, viendo la coronilla y los hombros; NUNCA de perfil ni a la altura de los ojos, aunque la figura mire de lado. Misma escala en las ocho.',
    'Es la lámina de identidad por los ocho lados: el equipo, los colores y los materiales son idénticos en todas y se leen con claridad.',
    SIN_FONDO,
  ].join('\n');
}

function reglasDeIconos(e: Encargo): string {
  const n = e.nombres?.length ?? 0;
  const { filas, columnas } = rejillaDeIconos(n);
  return [
    `Rejilla de EXACTAMENTE ${filas} fila${filas > 1 ? 's' : ''} por ${columnas} columnas: ${n} iconos del mismo tamaño, cada uno compacto y entero, con mucho aire alrededor; ningún icono toca a otro.`,
    SIN_FONDO,
  ].join('\n');
}

function reglasDeEfecto(): string {
  const { columnas, filas } = REJILLA_DE_EFECTO;
  return [
    `Hoja de animación de EXACTAMENTE ${columnas * filas} fotogramas del mismo efecto, en ${columnas} columnas por ${filas} filas, en orden de lectura: del inicio al final del efecto.`,
    'Cada fotograma ocupa su celda de una rejilla imaginaria igual para todos, centrado en el mismo punto de su celda y a la misma escala; nada cruza el borde de su celda.',
    SIN_FONDO,
  ].join('\n');
}

function reglas(e: Encargo): string {
  switch (e.tipo) {
    case 'atlas':
      return reglasDeAtlas(e);
    case 'identidad':
      return reglasDeIdentidad();
    case 'giro':
      return reglasDeGiro();
    case 'iconos':
      return reglasDeIconos(e);
    case 'efecto':
      return reglasDeEfecto();
    case 'imagen':
      return reglasDeImagen(e);
  }
}

function reglasDeImagen(e: Encargo): string {
  return e.fondo === 'opaco'
    ? 'Imagen opaca, sin texto ni marco.'
    : `Todo lo dibujado cabe en la imagen con margen. ${SIN_FONDO}`;
}

/** El prompt entero que viaja a Codex, y el que se guarda en la procedencia. */
export function promptDe(e: Encargo): string {
  if (e.reanudar) {
    return [
      'Corrige la última imagen que has generado en esta conversación, con la herramienta de imágenes, conservando la identidad del personaje y todo lo que no se menciona.',
      prefacioDeReferencias(e.referencias),
      e.reanudar.correccion,
      reglas(e),
    ].join('\n\n');
  }
  return [
    'Genera UNA imagen con la herramienta de imágenes integrada. No escribas código ni ficheros: solo la imagen.',
    prefacioDeReferencias(e.referencias),
    e.descripcion,
    reglas(e),
  ]
    .filter((p) => p.length > 0)
    .join('\n\n');
}
