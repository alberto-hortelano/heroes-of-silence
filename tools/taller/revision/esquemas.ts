/**
 * Los esquemas de la revisión de animaciones: lo que devuelven los jueces (el
 * juicio de un clip), los árbitros (el arbitraje de sus hallazgos) y la
 * comparación a ciegas de dos versiones, y lo que contesta la persona en el
 * visor. Un solo sitio: el JSON Schema que recibe Codex (`--output-schema`) se
 * deriva de aquí (`esquemaParaCodex`) y lo que vuelve se valida con lo mismo, sea
 * de ChatGPT o de un subagente de Claude.
 *
 * Los nombres de los campos son los del prototipo (`que_se_ve`, `por_fotograma`):
 * los juicios de la calibración (`calibracion/`) se escribieron con ellos.
 */
import { existsSync, readFileSync } from 'node:fs';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

export const CATEGORIAS = [
  'encuadre',
  'pose',
  'coherencia',
  'camara',
  'artefacto',
  'bucle',
] as const;

export const TIPOS_DE_HALLAZGO = [
  'salto_de_posicion',
  'cambio_de_escala',
  'no_copia_al_maniqui',
  'lado_cambiado',
  'fase_fuera_de_orden',
  'pose_de_la_identidad',
  'cambia_el_equipo',
  'cambia_el_arma',
  'arma_en_otra_mano',
  'cambia_el_color',
  'cambian_las_proporciones',
  'mira_a_otro_lado',
  'camara_de_perfil',
  'miembro_de_mas_o_de_menos',
  'arma_cortada',
  'trozo_suelto',
  'salto_del_bucle',
] as const;

const severidad = z
  .union([z.literal(1), z.literal(2), z.literal(3)])
  .describe('1 se nota si se busca; 2 se nota jugando; 3 rompe la animación');

export const hallazgoSchema = z
  .object({
    categoria: z.enum(CATEGORIAS),
    tipo: z.enum(TIPOS_DE_HALLAZGO),
    fotogramas: z.array(z.number().int()),
    severidad,
    que_se_ve: z.string(),
    correccion: z
      .string()
      .describe('la instrucción concreta que se le daría al pintor para ese fotograma'),
  })
  .strict();
export type Hallazgo = z.infer<typeof hallazgoSchema>;

/** El juicio de un clip, de un juez (ChatGPT o un subagente de Claude). */
export const juicioSchema = z
  .object({
    clip: z.string(),
    veredicto: z
      .enum(['bien', 'retocar', 'rehacer'])
      .describe(
        'bien: se puede usar tal cual; retocar: algún fotograma o el encuadre se arreglan; rehacer: la hoja entera no sirve',
      ),
    hallazgos: z.array(hallazgoSchema),
    resumen: z.string(),
  })
  .strict();
export type Juicio = z.infer<typeof juicioSchema>;

export const DECISIONES = ['real', 'falso', 'dudoso'] as const;

/** Lo que dice un árbitro de los hallazgos unidos de un clip, y lo que nadie vio. */
export const arbitrajeSchema = z
  .object({
    clip: z.string(),
    decisiones: z.array(
      z
        .object({
          /** El índice del hallazgo en la unión (`[n]` en el prompt). */
          indice: z.number().int(),
          decision: z.enum(DECISIONES),
          motivo: z.string(),
        })
        .strict(),
    ),
    omitidos: z
      .array(hallazgoSchema)
      .describe('defectos reales de severidad 2 o más que ningún juez vio'),
  })
  .strict();
export type Arbitraje = z.infer<typeof arbitrajeSchema>;

/** La comparación a ciegas de dos versiones de un clip. */
export const comparacionSchema = z
  .object({
    clip: z.string(),
    mejor: z.enum(['A', 'B', 'igual']),
    confianza: z
      .union([z.literal(1), z.literal(2), z.literal(3)])
      .describe('1 dudoso, 2 claro, 3 muy claro'),
    por_fotograma: z.array(
      z.object({ fotograma: z.number().int(), mejor: z.enum(['A', 'B', 'igual']) }).strict(),
    ),
    motivo: z.string(),
    defectos_del_mejor: z.string().describe('lo que aún está mal en la versión elegida'),
  })
  .strict();
export type Comparacion = z.infer<typeof comparacionSchema>;

/**
 * Lo que guarda el visor (`vision visor`): por caso, la opción pulsada y la nota.
 * Lo escribe la página; quien lo lee es quien escribió la pregunta (`casos.json`).
 */
export const respuestasSchema = z.record(
  z.string(),
  z.object({ valor: z.string().optional(), nota: z.string().optional() }),
);
export type Respuestas = z.infer<typeof respuestasSchema>;

/**
 * El JSON Schema que recibe `codex exec --output-schema`: el modo estricto de
 * OpenAI pide `additionalProperties: false` y todo campo en `required`, que es lo
 * que da `zod-to-json-schema` con `target: 'openAi'` sobre objetos `.strict()`.
 */
export function esquemaParaCodex(esquema: z.ZodTypeAny): Record<string, unknown> {
  const { $schema: _, ...resto } = zodToJsonSchema(esquema, {
    target: 'openAi',
    $refStrategy: 'none',
  }) as Record<string, unknown>;
  return resto;
}

/** Lee un JSON y lo valida con su esquema, o lanza diciendo qué fichero y qué campo. */
export function validarCon<T>(esquema: z.ZodType<T>, texto: string, de: string): T {
  let crudo: unknown;
  try {
    crudo = JSON.parse(texto);
  } catch (e) {
    throw new Error(`${de} no es JSON: ${(e as Error).message}`);
  }
  const r = esquema.safeParse(crudo);
  if (!r.success)
    throw new Error(
      `${de} no cumple su esquema: ${r.error.issues.map((i) => `${i.path.join('.') || '(raíz)'}: ${i.message}`).join('; ')}`,
    );
  return r.data;
}

/** Un JSON con su esquema si el fichero existe, o `undefined`; si existe y no vale, lanza con la ruta. */
export function leerSiHay<T>(esquema: z.ZodType<T>, ruta: string): T | undefined {
  return existsSync(ruta) ? validarCon(esquema, readFileSync(ruta, 'utf8'), ruta) : undefined;
}

/** Un JSON con su esquema, o lanza con la ruta (si no está, también). */
export function leerCon<T>(esquema: z.ZodType<T>, ruta: string): T {
  const v = leerSiHay(esquema, ruta);
  if (v === undefined) throw new Error(`no está ${ruta}`);
  return v;
}
