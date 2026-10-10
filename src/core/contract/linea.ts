/**
 * La forma de un texto libre que el agente escribe para una persona: una línea
 * legible. Vive aparte de `agent.ts` para que la lean también las reglas que
 * juzgan línea a línea (las voces de la base, `town/voces.ts`) sin arrastrar el
 * contrato entero, que importa los serializadores y cerraría un ciclo.
 */
import { z } from 'zod';

/**
 * Lo que lee una persona: una sola línea **y que se lea**. Sin caracteres de
 * control —el salto parte el bloque de veredictos, que se lee línea a línea, y
 * un `\u0000` o un tabulador no los pinta nadie— y con al menos un carácter
 * visible: QA encontró que `"   "` pasaba, y daba un héroe sin nombre en el
 * panel, la crónica y el veredicto. «Visible» descuenta también los de formato
 * (`\p{Cf}`, el espacio de anchura cero), que `trim()` no quita.
 *
 * #128 cerró lo que aún se colaba, en tres preguntas separadas porque cada una
 * tiene su motivo:
 * - **Una línea** descarta también U+2028/U+2029 (`\p{Zl}`, `\p{Zp}`), que no
 *   son `\p{Cc}` pero parten la línea igual, y los controles de dirección
 *   (`\p{Bidi_Control}`: el RLO U+202E da la vuelta a lo que viene detrás, en
 *   el veredicto también).
 * - **Algo que se lea** descarta lo que se pinta en blanco sin ser espacio: el
 *   braille vacío U+2800, los rellenos coreanos U+3164, U+FFA0 y U+115F
 *   (`\p{Default_Ignorable_Code_Point}`) y las marcas combinantes. Lo ignorable
 *   va SOLO aquí: incluye el selector de variante U+FE0F de ❤️ y el ZWJ U+200D
 *   de 👨‍👩‍👧, que dentro de un texto son legítimos; prohibirlos en la primera
 *   regla rompería los emojis compuestos.
 * - **Sin empezar por una marca**: un acento combinante suelto al principio se
 *   pega a lo que haya antes en la línea donde se pinte.
 * - **Sin invisibles entre lo visible**: un U+200B, un WORD JOINER, un guion
 *   blando o un ZWJ entre dos letras hacen que «Ana​Bo» se vea «AnaBo» y sea
 *   otro nombre; las etiquetas U+E0020–E007F, igual. Se prohíbe todo `Cf` y
 *   todo ignorable salvo lo que forma un emoji (`SECUENCIA_DE_EMOJI`). Se pierde
 *   a propósito el guion blando en nombres largos, los selectores de variante
 *   CJK (U+E0100+) y los rellenos jamo dentro de una palabra.
 *   **Lo que no se cierra del todo**: la regla mira la forma de la secuencia,
 *   no la lista de emojis que existen, que cambia con cada versión y que el
 *   Node del servidor no trae. Así que se cuela un ZWJ entre dos pictográficos
 *   que no formen secuencia reconocida (🐉‍🐉 se ve como dos emojis, igual
 *   que sin el ZWJ), y un U+FE0E/FE0F tras un pictográfico que no lo admite,
 *   que a la vista no cambia nada. Las banderas de etiquetas sí se cierran por
 *   lista (las tres del Reino Unido) y el selector de una tecla exige el
 *   U+20E3 que la cierra (QA de #158, M-1).
 * - **Caracteres que existen**: ni uso privado, ni no-caracteres, ni sustitutos
 *   sueltos, que el estándar fija para siempre. Lo sin asignar (`\p{Cn}`) NO se
 *   prohíbe: sigue la tabla Unicode del motor, así que un emoji más nuevo que el
 *   Node del servidor se rechazaría, y un solo nombre rechazado tira el plan de
 *   mapa entero; un sin asignar se pinta como una caja, que es mucho más barato.
 *   `Extended_Pictographic` reserva de antemano los huecos de emoji futuros, así
 *   que el ZWJ de un emoji nuevo tampoco depende de la versión.
 * - **Lo que queda acotado a la versión**: `\p{M}` y `\p{Cf}` de caracteres
 *   asignados después de la tabla del Node: una marca nueva al principio o un
 *   `Cf` nuevo pasarían por sin asignar. El test se ha corrido a mano con las dos
 *   tablas (Node v24.11.1, Unicode 16, y v26, Unicode 17). CI corre la versión
 *   exacta de `.node-version` (#163: v24.21.0, Unicode 17.0, la misma tabla que
 *   la v26.10 local), que es también el suelo de `engines`: subirla es un cambio
 *   que se ve en el diff, no una menor nueva que entra sola.
 *
 * Es la puerta de todos los textos libres que el agente escribe para una persona
 * —los nombres del plan de mapa (#97) y el nombre y la historia del héroe
 * nacido—, así que un hueco que se cierra aquí se cierra en todos.
 */
/**
 * La bandera de etiquetas: 🏴 + etiquetas + U+E007F. Solo las tres que existen
 * como emoji (Inglaterra, Escocia y Gales): otra subdivisión, aunque tenga forma
 * válida, se pinta como la bandera negra sola y sería otro nombre que se ve
 * igual. Cuando Unicode añada una, se añade aquí.
 */
const BANDERA_DE_ETIQUETAS =
  /\u{1F3F4}\u{E0067}\u{E0062}(?:\u{E0065}\u{E006E}\u{E0067}|\u{E0073}\u{E0063}\u{E0074}|\u{E0077}\u{E006C}\u{E0073})\u{E007F}/u;
/**
 * El selector de variante tras un pictográfico (❤️) o en una tecla (1️⃣). Tras
 * un dígito, `#` o `*` solo vale si le sigue el U+20E3 que cierra la tecla:
 * «Bo1» + U+FE0F sin él se ve «Bo1».
 */
const SELECTOR_TRAS_PICTOGRAFICO =
  /(?<=\p{Extended_Pictographic})[\uFE0E\uFE0F]|(?<=[0-9#*])[\uFE0E\uFE0F](?=\u20E3)/u;
/**
 * El ZWJ entre pictográficos, también tras un tono de piel o tras el selector de
 * un pictográfico: 👨‍👩‍👧, 👩🏽‍💻, ❤️‍🔥. El selector de una tecla a medias no
 * cuenta: «Bo1» + U+FE0F + ZWJ + 🐉 se ve «Bo1🐉».
 */
const ZWJ_ENTRE_PICTOGRAFICOS =
  /(?<=[\p{Extended_Pictographic}\p{Emoji_Modifier}]|\p{Extended_Pictographic}\uFE0F)\u200D(?=\p{Extended_Pictographic})/u;
/** Lo invisible que sí se deja: lo que forma un emoji. */
const SECUENCIA_DE_EMOJI = new RegExp(
  [BANDERA_DE_ETIQUETAS, SELECTOR_TRAS_PICTOGRAFICO, ZWJ_ENTRE_PICTOGRAFICOS]
    .map((r) => r.source)
    .join('|'),
  'gu',
);
const INVISIBLE = /[\p{Cf}\p{Default_Ignorable_Code_Point}]/u;
export const lineaLegible = (max: number, sujeto: string) =>
  z
    .string()
    .min(1)
    .max(max)
    .regex(
      /^[^\p{Cc}\p{Zl}\p{Zp}\p{Bidi_Control}]+$/u,
      `${sujeto} es una sola línea, sin saltos, caracteres de control ni marcas de dirección`,
    )
    .regex(
      // `\p{Cf}` no sobra al lado de lo ignorable: hay `Cf` que no son
      // ignorables y tampoco se leen, como U+0600–0605 y U+06DD.
      /[^\s\p{Cc}\p{Cf}\p{M}\p{Default_Ignorable_Code_Point}\u2800]/u,
      `${sujeto} no puede ir en blanco: tiene que llevar algo que se lea`,
    )
    .regex(/^\P{M}/u, `${sujeto} no puede empezar por un acento o una marca suelta`)
    .regex(
      // Uso privado (`Co`), no-caracteres (U+FFFF, U+FDD0) y sustitutos sueltos
      // (`Cs`): no son nada que se lea, y cada pantalla pinta otra cosa —una
      // caja, un hueco, un glifo de una fuente privada—.
      /^[^\p{Co}\p{Cs}\p{Noncharacter_Code_Point}]+$/u,
      `${sujeto} solo puede llevar caracteres que existen: nada de uso privado, no-caracteres ni sustitutos sueltos`,
    )
    // El último: `refine` cierra la cadena de `z.string()`.
    .refine(
      (s) => !INVISIBLE.test(s.replace(SECUENCIA_DE_EMOJI, '')),
      `${sujeto} no puede llevar caracteres invisibles: solo los que unen un emoji`,
    );

/**
 * Por qué `texto` no es una línea legible de hasta `max` caracteres, o `null`
 * si lo es. Es la misma regla que el esquema, para quien juzga cada línea sola
 * en vez de tirar la respuesta entera por una.
 */
export function motivoDeLinea(texto: string, max: number, sujeto: string): string | null {
  const r = lineaLegible(max, sujeto).safeParse(texto);
  if (r.success) return null;
  const issue = r.error.issues[0];
  if (issue === undefined) return `${sujeto} no vale`;
  if (issue.code === 'too_big') return `${sujeto} pasa de ${max} caracteres`;
  if (issue.code === 'too_small') return `${sujeto} no puede ir vacía`;
  return issue.message;
}
