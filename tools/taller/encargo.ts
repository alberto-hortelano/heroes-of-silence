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
import { esIdDeNpc } from '../../src/core/npcs.js';
import { FACTION_IDS } from '../../src/core/types.js';
import {
  FIGURA,
  HOJAS_DE_FIGURA,
  type HojaDeFigura,
  NOMBRES_DE_DIRECCION,
} from '../../src/shared/arte.js';

/** Las hojas de una dirección (`HOJAS_DE_FIGURA`), como las admite un encargo. */
const LETRAS_DE_HOJA = Object.keys(HOJAS_DE_FIGURA) as [HojaDeFigura, ...HojaDeFigura[]];

/** Lo que cada referencia aporta, y nada más. */
export const PAPELES = {
  pose: 'es la REFERENCIA DE POSE: el maniquí Y Bot renderizado con cámara ortográfica elevada 25 grados. Manda en la cámara, la anatomía, la escala y el movimiento de cada celda. Copia cada pose articulación por articulación. Si el maniquí lleva atrezo gris (un palo por espada, un plano por escudo, una ballesta, una bola), es solo un PUNTO DE PARTIDA: dice dónde están las manos que empuñan, hacia dónde apunta el arma y cuándo se dispara o se suelta. El arma que se pinta es la del PERSONAJE (la de su identidad): cambia la forma, el largo y las piezas del atrezo para que sea la suya —un arcabuz donde el maniquí lleva ballesta, una daga en la izquierda donde lleva escudo, nada donde el personaje no lleva arma— sin cambiar la pose del cuerpo. Si sus piernas son de color, la ROJA es la pierna DERECHA y la AZUL la IZQUIERDA: sirven para no confundirlas en el paso ni girar la figura de espaldas; el personaje NO lleva esos colores. El fondo VERDE de esta hoja es solo fondo, para que se vea el maniquí: no lo copies, el resultado va sobre transparente',
  identidad:
    'es la IDENTIDAD DEL PERSONAJE: define su aspecto (cara, ropa, armadura, armas, colores) y su acabado pintado. No determina la cámara, la anatomía ni la pose',
  // Sin hablar de su cámara: unas referencias de estilo están de frente (las
  // láminas de `assets/art/`) y otras a 25° (la muestra del mapa). La cámara la
  // dice cada encargo; aquí decirla mentía a la mitad de ellos.
  estilo:
    'es la referencia de ESTILO: el acabado pintado, los materiales y la paleta que hay que seguir. No copies su contenido ni su composición',
  // Para piezas cuya geometría tiene que casar con la rejilla del mapa (un
  // puente recto, una pared que cae al este): la orientación no se consigue
  // con palabras, y la referencia de estilo arrastra la suya.
  // Para piezas que tienen que casar en color con otras (la ladera con la pared
  // frontal de su material) sin heredar su forma: las columnas de la frontal
  // volvían en cuanto iba como identidad (§20).
  material:
    'es la referencia de MATERIAL: de ella se toman SOLO el color, la textura y la paleta de la roca y de lo que crece en ella, para que case con estas piezas. NO copies su forma (columnas, prismas, bloques en fila) ni su composición',
  // La guía del cuadro maestro: solo suelo, puertas y la vara de medir. Las cajas
  // de la primera prueba se copiaron tal cual, altas e inclinadas; sin vara, las
  // puertas salían de medio adulto (pruebas de la vuelta 3).
  plaza:
    'es la GUÍA DE LA PLAZA: el gris CLARO de abajo es el empedrado por el que se anda, solo esa franja baja; cada punto oscuro numerado sobre su borde de atrás es donde va el UMBRAL de la PUERTA del edificio con ese número; y junto a cada punto hay una SILUETA OSCURA DE UN ADULTO de pie, a su tamaño real en este cuadro: es la VARA DE MEDIR de todo. No pintes sus grises lisos, sus puntos, sus números ni sus siluetas',
  // La sala de una morada pintada a pantalla entera (la vuelta 1 de la morada),
  // para su versión abierta: lo de dentro, no el encuadre (`encargoDeLaAbierta`).
  interior:
    'es la SALA de ese edificio por dentro: de ella salen los muebles, los materiales, la luz y la heráldica de lo que se ve al abrirlo. NO manda en el encuadre ni en la escala: va DENTRO del edificio de la imagen 1, a la escala de su plaza, no a pantalla entera',
  // La hoja de los edificios que van en el cuadro: los de la primera vuelta, que
  // salieron proporcionados (las fachadas giradas de la vuelta 2, no).
  edificios:
    'es la hoja de IDENTIDAD de los edificios: cada uno suelto y con su número, que es el de la guía. Manda en su diseño, sus materiales, sus colores, su tejado, su heráldica y sus PROPORCIONES. No manda en el encuadre, la escala ni el atrezo suelto que lleva alrededor',
  // Las ediciones del cuadro (la placa vacía, cada mejora): una petición nueva con
  // la imagen adjunta. Reabrir el hilo con `exec resume` falló dos de dos veces.
  edita:
    'es la IMAGEN QUE SE EDITA: el resultado es esta misma imagen, píxel a píxel, con el ÚNICO cambio que se pide. Todo lo demás —el encuadre, la escala, la luz, el cielo, el empedrado y cada cosa en su sitio— se queda exactamente igual',
  // Las pruebas del 10-10-2026 (`experimento.ts`): ¿copia mejor el movimiento
  // si ve el volumen? Como complemento de la pose o en su lugar.
  profundidad:
    'es el MAPA DE PROFUNDIDAD del mismo maniquí, celda a celda como la referencia de pose: cuanto más claro, más cerca de la cámara; el negro es fondo. Dice el volumen y qué brazo, qué pierna y qué arma van delante de cuáles en cada celda, y manda en eso igual que la pose. NO copies su gris ni su fondo negro: es solo información',
  'pose-profundidad':
    'es la REFERENCIA DE POSE, dada como MAPA DE PROFUNDIDAD del maniquí Y Bot renderizado con cámara ortográfica elevada 25 grados: cuanto más claro, más cerca de la cámara; el negro es fondo. Manda en la cámara, la anatomía, la escala y el movimiento de cada celda: copia cada pose articulación por articulación, y lee en los grises qué brazo, qué pierna y qué arma van delante. Si el maniquí lleva un palo por espada o un plano por escudo, es solo un PUNTO DE PARTIDA: el arma que se pinta es la del PERSONAJE (la de su identidad), sin cambiar la pose del cuerpo. NO copies su gris ni su fondo negro: el resultado va sobre transparente',
  // Editar una hoja ya pintada (las pruebas del 10-10-2026): que copie mejor la
  // pose del maniquí sin volver a inventar el personaje.
  editar:
    'es la HOJA YA PINTADA de este personaje que hay que EDITAR: el personaje, su aspecto, su ropa, sus colores, su acabado, la rejilla y el sitio y el tamaño de cada figura se conservan; solo cambia la postura. Su fondo VERDE es solo fondo: el resultado va sobre transparente',
  'editar-silueta':
    'es la HOJA YA PINTADA de este personaje que hay que EDITAR, con la SILUETA del maniquí de cada pose superpuesta en CIAN translúcido con su contorno: la silueta dice la postura que tiene que tener cada figura y NO se pinta. El personaje, su aspecto, su ropa, sus colores, su acabado, la rejilla y el sitio y el tamaño de cada figura se conservan. Su fondo VERDE es solo fondo: el resultado va sobre transparente',
  // Editar el propio maniquí (10-10-2026): la pose, el sitio y el tamaño ya están
  // en la imagen; solo cambia quién es.
  'editar-maniqui':
    'es la HOJA DEL MANIQUÍ que hay que EDITAR: cada figura es un maniquí Y Bot con cámara ortográfica elevada 25 grados. Conviértelo en el personaje SIN cambiar nada más: la misma postura articulación por articulación, el mismo sitio, el mismo tamaño y la misma orientación de cada figura, la misma cámara y la misma rejilla. Si sus piernas son de color, la ROJA es la DERECHA y la AZUL la IZQUIERDA (el personaje no lleva esos colores); el palo gris que empuña es su arma, que pasa a ser la del personaje',
  guia: 'es la GUÍA DE GEOMETRÍA: un volumen gris sin acabado, dibujado con la cámara del juego. Manda en la ORIENTACIÓN, la forma, las proporciones, el tamaño y la posición de cada pieza dentro de la imagen: cópialas con exactitud, sin girar ni torcer nada. NO copies su gris liso, sus aristas de esquema ni su fondo plano: el material, el detalle y la luz son los de la imagen de estilo',
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

const referencia = z.object({
  ruta,
  papel: z.enum(Object.keys(PAPELES) as [Papel, ...Papel[]]),
});

export const encargoSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'el id va en kebab-case'),
    tipo: z.enum([
      'identidad',
      'giro',
      'atlas',
      'imagen',
      'iconos',
      'efecto',
      'textura',
      'modulos',
    ]),
    /** El contenido: quién es, qué lleva. Las reglas de cámara y fondo las pone el taller. */
    descripcion: z.string().min(20),
    referencias: z.array(referencia),
    /** Ruta de salida SIN extensión: el taller escribe `.webp` (o `.png`) y `.procedencia.json`. */
    salida: ruta,
    /** Atlas: lado de la celda. 384 en las hojas de 8 direcciones, donde cabe el cadáver. */
    celda: z.union([z.literal(256), z.literal(384)]).optional(),
    /** Atlas: la altura del reposo frente a la de un adulto (`FIGURA.alturaAdulto`). Un goblin, menos; un troll, más. */
    talla: z.number().positive().optional(),
    /** Imagen: si el fondo se recorta o la imagen es opaca (un fondo de batalla). */
    fondo: z.enum(['transparente', 'opaco']).default('transparente'),
    /**
     * Imagen opaca: el tamaño exacto al que se lleva lo que devuelva Codex. Los
     * cuadros de la base miden un tramo (`TRAMO`): se cosen a tope y se recortan
     * píxel a píxel contra su placa.
     */
    tamano: z
      .object({ ancho: z.number().int().positive(), alto: z.number().int().positive() })
      .optional(),
    /**
     * Lo que se hace después de escribir la salida: rehacer los recortes de la base
     * de esa facción, o encolar lo que sigue de una figura del banco de NPC
     * (`encargosQueSiguen`, `tools/taller/npcs.ts`: la identidad, el giro, las hojas).
     */
    despues: z
      .discriminatedUnion('orden', [
        z.object({ orden: z.literal('recortar-base'), faccion: z.enum(FACTION_IDS) }),
        z.object({
          orden: z.literal('encadenar-npc'),
          npc: z.string().refine(esIdDeNpc, 'no es el id de una figura del banco de NPC'),
        }),
      ])
      .optional(),
    /** Corrige una generación anterior en su mismo hilo de Codex, que conserva la identidad. */
    reanudar: z.object({ hilo: z.string().uuid(), correccion: z.string().min(10) }).optional(),
    /**
     * Atlas de una unidad en 8 direcciones: cuál de las 8 y qué hoja de
     * `HOJAS_DE_FIGURA`. La A es quieto, andando y carga; la B, ataque, daño y
     * muerte; la C, el disparo de quien dispara. Todo atlas lo lleva: el de una
     * sola dirección se retiró el 03-10-2026.
     */
    ocho: z
      .object({
        direccion: z.number().int().min(0).max(7),
        hoja: z.enum(LETRAS_DE_HOJA),
        /**
         * La hoja del maniquí contra la que se escala y se evalúa, cuando no es
         * la primera referencia: en una edición, la primera es la hoja que se edita.
         */
        pose: ruta.optional(),
      })
      .optional(),
    /** Módulos del escenario: cuántos lleva la hoja, en filas de 4. */
    cuantos: z.number().int().min(4).max(16).optional(),
    /** Iconos: el nombre de cada uno, en el orden de lectura de la lámina de 4×4. */
    nombres: z.array(z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)).optional(),
    /**
     * Otro modelo que el de ChatGPT por la suscripción: un endpoint de fal.ai
     * (las pruebas del 10-10-2026, `MOTORES` en `experimento.ts`). Sin él, codex.
     */
    motor: z
      .object({
        nombre: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
        endpoint: z.string().regex(/^[a-z0-9-]+(\/[a-z0-9.-]+)+$/),
        /** Lo que se le pasa además del prompt y las imágenes: tamaño, calidad… */
        params: z.record(z.string(), z.unknown()).default({}),
        /** Lo que cuesta una llamada, en dólares (de la página de fal; estimado si cobra por tokens). */
        coste: z.number().positive(),
        /** Si devuelve alfa, o un fondo liso que el taller recorta (`cutoutBackground`). */
        fondo: z.enum(['transparente', 'liso']),
        /** La pose va como ControlNet (la primera referencia) y el resto, solo por texto. */
        control: z.literal(true).optional(),
        /** El prompt en otro idioma, si el modelo no entiende bien el español (FLUX.1). */
        prompt: z.string().min(20).optional(),
        /**
         * Un modelo de vídeo de transferencia de movimiento (`video.ts`): una
         * llamada por acción con el vídeo del maniquí; `coste` es por segundo.
         */
        video: z.literal(true).optional(),
        /** Otra tirada del mismo encargo: entra en la clave de la caché de fal (si no, sale la misma imagen). */
        intento: z.number().int().min(2).optional(),
      })
      .optional(),
  })
  .superRefine((e, ctx) => {
    if (e.tipo === 'iconos') {
      try {
        rejillaDeIconos(e.nombres?.length ?? 0);
      } catch (err) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: (err as Error).message });
      }
    }
    if (e.tipo === 'atlas' && e.ocho === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'un atlas es una hoja de una dirección de 8 y lleva `ocho`: el atlas de una sola dirección se retiró el 03-10-2026',
      });
    }
    const papeles = e.referencias.map((r) => r.papel);
    const edita =
      papeles[0] === 'editar' || papeles[0] === 'editar-silueta' || papeles[0] === 'editar-maniqui';
    if (e.tipo === 'atlas' && edita !== (e.ocho?.pose !== undefined)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'un atlas que edita una hoja pintada (`editar` o `editar-silueta` primero) dice contra qué maniquí se escala (`ocho.pose`), y solo él',
      });
    }
    if (
      e.tipo === 'atlas' &&
      !e.reanudar &&
      !edita &&
      (!(papeles[0] === 'pose' || papeles[0] === 'pose-profundidad') || papeles[1] !== 'identidad')
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'un atlas lleva primero la referencia de pose (en color o en profundidad) y después la identidad del personaje (y quizá un estilo)',
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

/** El fondo que se pide a un motor que no da alfa: liso, para recortarlo (`cutoutBackground`). */
const FONDO_LISO =
  'Fondo LISO de un solo color gris medio uniforme (#808080), sin degradado, sin suelo, sin sombra pintada, sin halo, sin rejilla y sin texto. Iluminación desde arriba a la izquierda y por delante, del lado del espectador: la cara visible del personaje está iluminada y las sombras propias caen hacia la derecha y hacia el fondo. Sin contraluz.';

/** Las reglas con el fondo que da el motor del encargo: el alfa de siempre, o liso. */
function conFondo(e: Encargo, texto: string): string {
  return e.motor?.fondo === 'liso' ? texto.replace(SIN_FONDO, FONDO_LISO) : texto;
}

/** Lo que pinta cada fila de una hoja de 8 direcciones. */
const FILAS_OCHO = {
  a: 'Fila 1: las siete poses de reposo de la fila 1 de la referencia de pose. Fila 2: las siete fases de marcha de la fila 2, con apoyo y paso alternando pierna cercana y lejana y los brazos en oposición. Fila 3: las siete fases de la CARGA de la fila 3: corriendo al ataque con sus armas donde las lleva el maniquí. Cada fila copia su fila de la referencia, articulación por articulación.',
  b: 'Fila 1: las siete poses de ATAQUE de la fila 1 de la referencia de pose, atacando con el arma del personaje. Fila 2: las siete poses de RECIBIR DAÑO de la fila 2: encaja un golpe y retrocede. Fila 3: las siete poses de la MUERTE de la fila 3: la primera es EXACTAMENTE la última de la fila 2, luego se desploma, y la última es el cadáver tendido e inmóvil en el suelo, con sus armas en el suelo donde las tiene el maniquí. Cada fila copia su fila de la referencia, articulación por articulación.',
  // Una sola fila (`HOJAS_DE_FIGURA.c`): el pintor no ha visto nunca una tira de
  // siete, así que se le dice que es una y que no la reparta en más.
  c: 'UNA SOLA FILA: las siete poses de DISPARO de la referencia de pose, disparando con el arma a distancia del personaje (la de su identidad: arco, ballesta, arcabuz, culebrina, rifle, pistola o granada). En las primeras columnas apunta o carga el tiro; en la columna en la que el maniquí suelta, el proyectil sale y ya no se ve en la mano ni en el arma, ni tampoco en el aire: NO pintes la flecha, el virote, la bala ni la granada volando (el juego los dibuja aparte); como mucho, un fogonazo o un poco de humo en la boca de un arma de fuego. Después, el arma vuelve. Copia la fila de la referencia, articulación por articulación.',
} as const satisfies Record<keyof typeof HOJAS_DE_FIGURA, string>;

/** La hoja de un atlas de 8 direcciones; lanza si el encargo no dice cuál. */
function ochoDe(e: Encargo): NonNullable<Encargo['ocho']> {
  if (e.ocho === undefined) {
    throw new Error(`${e.id}: un atlas es una hoja de una dirección de 8 y lleva \`ocho\``);
  }
  return e.ocho;
}

/** Las filas de la hoja de un atlas de 8 direcciones: las de su hoja en `HOJAS_DE_FIGURA`. */
export function filasDeAtlas(e: Encargo): number {
  return HOJAS_DE_FIGURA[ochoDe(e).hoja].length;
}

/** Los píxeles de alto del reposo de un atlas: los de un adulto por la talla de la unidad. */
export function alturaDelReposo(e: Encargo): number {
  return Math.round(FIGURA.alturaAdulto * (e.talla ?? 1));
}

/** Lo que se pide a cada fila de una hoja que se edita, en vez de `FILAS_OCHO`. */
const FILAS_DE_UNA_EDICION =
  'Las mismas figuras en las mismas celdas y en el mismo orden, editadas una a una: cada figura de la fila N y la columna M toma la postura de la fila N y la columna M de la referencia de su pose (brazos, piernas, torso, cabeza y arma, articulación por articulación) y conserva todo lo demás.';

/** Lo que se pide a cada fila cuando se edita el propio maniquí (`editar-maniqui`). */
const FILAS_SOBRE_EL_MANIQUI =
  'Las mismas 21 figuras en las mismas celdas y en el mismo orden: cada maniquí se convierte en el personaje con EXACTAMENTE su postura, su sitio y su tamaño. Fila 1, el reposo; fila 2, la marcha; fila 3, la carga: no cambies ninguna pose.';

function reglasDeAtlas(e: Encargo): string {
  const ocho = ochoDe(e);
  const { columnas } = FIGURA;
  const filas = filasDeAtlas(e);
  // La hoja del disparo es de una sola fila: el prompt la nombra en singular.
  const una = filas === 1;
  const altura = alturaDelReposo(e);
  const mira = `El personaje mira hacia donde mira el maniquí (dirección «${NOMBRES_DE_DIRECCION[ocho.direccion]}» vista desde la cámara), en todas las celdas: copia su orientación, no la de la identidad.`;
  return [
    `Hoja de sprites de EXACTAMENTE ${columnas} columnas por ${filas} ${una ? 'fila' : 'filas'}, ${columnas * filas} figuras del MISMO personaje, separadas con holgura y sin tocarse.`,
    ocho.pose === undefined
      ? FILAS_OCHO[ocho.hoja]
      : e.referencias[0]?.papel === 'editar-maniqui'
        ? FILAS_SOBRE_EL_MANIQUI
        : FILAS_DE_UNA_EDICION,
    `Misma cámara ortográfica elevada 25 grados en ${una ? 'toda la fila' : 'todas las filas'}, viendo la coronilla y los dos hombros; NUNCA de perfil ni a la altura de los ojos: aunque el personaje mire de lado, se le ve desde arriba. ${mira}`,
    `Misma escala en todas las celdas: la figura de pie ocupa unos ${altura} de cada ${e.celda ?? FIGURA.celda} píxeles de alto. Todo el personaje y su arma caben dentro de su celda con margen.`,
    // Once de los primeros 52 atlas fallaron por lo mismo: en el ataque, la
    // lanza o la espada de una figura tocaba a la de al lado, y el taller no
    // puede separar dos figuras que se tocan. Se pide de entrada.
    `Deja al menos 40 píxeles de aire libre entre una figura y la siguiente en ${una ? 'la fila' : 'las tres filas'}. Ningún arma invade la celda vecina: si una lanza, pica, espada o maza extendida no cabe, recoge el brazo o inclina el arma hacia arriba.`,
    // Una sola fila es una tira muy apaisada: sin esto, ChatGPT agranda las
    // figuras hasta el alto de la imagen y se tocan (y el recorte cuenta menos).
    ...(una
      ? [
          'Las SIETE figuras separadas, cada una en su séptima parte del ancho: ninguna toca a la vecina, ni con el brazo extendido ni con el arma. Del mismo tamaño que en una hoja de tres filas; mejor pequeñas y con mucho aire que grandes y juntas. Entre una figura y la siguiente tiene que quedar una franja de fondo vacío de arriba abajo. Un arma larga (rifle, arcabuz, culebrina, pica) apunta algo hacia arriba o en escorzo hacia la cámara para no alcanzar a la figura de al lado; el fogonazo, pequeño y pegado a la boca del arma.',
        ]
      : []),
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
    case 'textura':
      return REGLAS_DE_TEXTURA;
    case 'modulos':
      return reglasDeModulos(e);
  }
}

/**
 * Las reglas de `tools/gen/prompts.ts`, aprendidas en los laboratorios de
 * ne-fan: un material visto a 90°, nunca un lugar (pedir «suelo» mete
 * perspectiva); liso, porque un motivo único canta al repetirse; y sin nombrar
 * el agua, que alucina ríos. La costura la fabrica el taller (`textura.ts`):
 * aquí solo se pide que no haya nada que la estropee.
 */
const REGLAS_DE_TEXTURA = [
  'Una muestra plana de MATERIAL vista exactamente desde arriba, a 90 grados, como una muestra de una biblioteca de texturas: sin perspectiva, sin horizonte y sin sombras proyectadas.',
  'Lisa y uniforme en toda la superficie: sin un motivo central, sin objetos sueltos, sin caminos, sin bordes ni marco, sin figuras y sin texto. Que se pueda repetir en mosaico por los cuatro lados sin que se note.',
  'Formato cuadrado, imagen opaca de borde a borde.',
].join('\n');

function reglasDeModulos(e: Encargo): string {
  const n = e.cuantos ?? e.nombres?.length ?? 16;
  return [
    // Con la última fila incompleta (las cinco bajadas) se dice cuántos lleva;
    // las hojas llenas conservan el texto con el que se pintaron.
    `${n % 4 === 0 ? `Rejilla de ${n / 4} filas por 4 columnas` : `Rejilla de ${Math.ceil(n / 4)} filas: 4 módulos por fila y ${n % 4} en la última`}: ${n} módulos sueltos de la misma familia, con mucho aire alrededor de cada uno; NINGÚN módulo toca a otro, ni con una rama ni con una sombra.`,
    'Todos con la misma cámara ortográfica elevada 25 grados sobre la horizontal, de frente y algo a la derecha, nunca cenital ni de perfil, y a la MISMA escala: un módulo pequeño es pequeño de verdad, no un grande dibujado más chico.',
    `Todo lo dibujado cabe en la imagen con margen. ${SIN_FONDO}`,
  ].join('\n');
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
  if (e.motor?.prompt !== undefined) return e.motor.prompt;
  // Por API no hay herramienta integrada que nombrar; con ControlNet la pose la
  // pone el control y las demás referencias no viajan: sin prefacio ni lo que
  // las nombra.
  const control = e.motor?.control === true;
  return [
    e.motor !== undefined
      ? e.ocho?.pose === undefined
        ? 'Genera UNA imagen.'
        : 'EDITA la imagen 1 y devuelve UNA imagen, la hoja editada.'
      : e.ocho?.pose === undefined
        ? 'Genera UNA imagen con la herramienta de imágenes integrada. No escribas código ni ficheros: solo la imagen.'
        : 'EDITA la imagen 1 con la herramienta de imágenes integrada y devuelve UNA imagen, la hoja editada. No escribas código ni ficheros: solo la imagen.',
    control ? '' : prefacioDeReferencias(e.referencias),
    control
      ? e.descripcion
          .split('\n')
          .filter((l) => !/\(imagen \d\)/.test(l))
          .join('\n')
      : e.descripcion,
    conFondo(e, reglas(e)),
  ]
    .filter((p) => p.length > 0)
    .join('\n\n');
}
