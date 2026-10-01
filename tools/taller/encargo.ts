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

/** Lo que cada referencia aporta, y nada más. */
export const PAPELES = {
  pose: 'es la REFERENCIA DE POSE: el maniquí Y Bot renderizado con cámara ortográfica elevada 25 grados. Manda en la cámara, la anatomía, la escala y el movimiento de cada celda. Copia cada pose articulación por articulación',
  identidad:
    'es la IDENTIDAD DEL PERSONAJE: solo define su aspecto (cara, ropa, armadura, armas, colores). No determina la cámara, la anatomía ni la pose',
  estilo:
    'es solo referencia de ESTILO pintado y de escala relativa. No copies su identidad, su pose ni su encuadre',
} as const;
export type Papel = keyof typeof PAPELES;

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
    tipo: z.enum(['identidad', 'atlas', 'imagen']),
    /** El contenido: quién es, qué lleva. Las reglas de cámara y fondo las pone el taller. */
    descripcion: z.string().min(20),
    referencias: z.array(referencia),
    /** Ruta de salida SIN extensión: el taller escribe `.webp` (o `.png`) y `.procedencia.json`. */
    salida: ruta,
    /** Atlas: altura de la figura en su celda. Por defecto, la de un adulto. */
    alturaObjetivo: z.number().int().min(60).max(240).optional(),
    /** Imagen: si el fondo se recorta o la imagen es opaca (un fondo de batalla). */
    fondo: z.enum(['transparente', 'opaco']).default('transparente'),
    /** Corrige una generación anterior en su mismo hilo de Codex, que conserva la identidad. */
    reanudar: z.object({ hilo: z.string().uuid(), correccion: z.string().min(10) }).optional(),
  })
  .superRefine((e, ctx) => {
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
    if (e.tipo === 'identidad' && !e.reanudar && papeles[0] !== 'pose') {
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

const SIN_FONDO =
  'Fondo con alfa real totalmente transparente: sin suelo, sin sombra pintada, sin halo, sin brillo, sin rejilla y sin texto. Iluminación suave desde arriba a la izquierda, sin contraluz fuerte.';

function reglasDeAtlas(e: Encargo): string {
  const { columnas } = FIGURA;
  const altura = e.alturaObjetivo ?? FIGURA.alturaAdulto;
  return [
    `Hoja de sprites de EXACTAMENTE ${columnas} columnas por 3 filas, ${columnas * 3} figuras del MISMO personaje, separadas con holgura y sin tocarse.`,
    'Fila 1: las siete poses de reposo de la fila 1 de la referencia de pose. Fila 2: las siete fases de marcha de la fila 2, con apoyo y paso alternando pierna cercana y lejana y los brazos en oposición. Fila 3: las siete poses de ataque de la fila 3.',
    'Misma cámara ortográfica elevada 25 grados en las tres filas, viendo la coronilla y los dos hombros; NUNCA de perfil ni a la altura de los ojos. El personaje mira a la derecha y al frente como el maniquí.',
    `Misma escala en todas las celdas: la figura de pie ocupa unos ${altura} de cada 256 píxeles de alto. Todo el personaje y su arma caben dentro de su celda con margen.`,
    SIN_FONDO,
  ].join('\n');
}

function reglasDeIdentidad(): string {
  return [
    'UN solo personaje, de cuerpo entero, de pie, en la primera pose de reposo de la referencia de pose.',
    'Cámara ortográfica elevada 25 grados, viendo la coronilla y los hombros; NUNCA de perfil. Mira a la derecha y al frente.',
    'Lámina de identidad: el equipo, los colores y los materiales se leen con claridad. Formato cuadrado, el personaje centrado con margen.',
    SIN_FONDO,
  ].join('\n');
}

function reglasDeImagen(e: Encargo): string {
  return e.fondo === 'opaco'
    ? 'Imagen opaca, sin texto ni marco.'
    : `Un solo objeto centrado con margen. ${SIN_FONDO}`;
}

/** El prompt entero que viaja a Codex, y el que se guarda en la procedencia. */
export function promptDe(e: Encargo): string {
  if (e.reanudar) {
    return [
      'Corrige la última imagen que has generado en esta conversación, con la herramienta de imágenes, conservando la identidad del personaje y todo lo que no se menciona.',
      e.reanudar.correccion,
      e.tipo === 'atlas'
        ? reglasDeAtlas(e)
        : e.tipo === 'identidad'
          ? reglasDeIdentidad()
          : reglasDeImagen(e),
    ].join('\n\n');
  }
  const reglas =
    e.tipo === 'atlas'
      ? reglasDeAtlas(e)
      : e.tipo === 'identidad'
        ? reglasDeIdentidad()
        : reglasDeImagen(e);
  return [
    'Genera UNA imagen con la herramienta de imágenes integrada. No escribas código ni ficheros: solo la imagen.',
    prefacioDeReferencias(e.referencias),
    e.descripcion,
    reglas,
  ]
    .filter((p) => p.length > 0)
    .join('\n\n');
}
