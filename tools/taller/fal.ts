/**
 * El taller pintando con un modelo de fal.ai en vez de ChatGPT por la
 * suscripción (las pruebas del 10-10-2026, `MOTORES` en `experimento.ts`): el
 * encargo lleva `motor`, y esto arma la llamada de su endpoint, la hace con el
 * `FalClient` de `tools/gen/fal.ts` (caché por payload, gasto acumulado, tope
 * que para antes de pagar) y devuelve lo mismo que `generar` de codex, para que
 * el post-proceso sea el de siempre.
 */
import { join, resolve } from 'node:path';
import sharp from 'sharp';
import { FalClient } from '../gen/fal.js';
import type { Generacion } from './codex.js';
import type { Encargo } from './encargo.js';

const RAIZ = resolve(import.meta.dirname, '../..');

/** Lo más largo de una referencia que no es la pose: identidad y estilo no necesitan más. */
const LADO_DE_REFERENCIA = 1536;

type Motor = NonNullable<Encargo['motor']>;

/** Una referencia ya preparada: su papel y su imagen como data URI. */
export interface ReferenciaDeFal {
  readonly papel: Encargo['referencias'][number]['papel'];
  readonly uri: string;
}

/**
 * La entrada del endpoint de un motor: con `control`, la primera referencia (la
 * profundidad) es el control y las demás no viajan; si no, todas van en
 * `image_urls`, en su orden, como las ve ChatGPT. Los `params` del motor
 * (tamaño, calidad, formato) van encima.
 */
export function cargaDeFal(
  motor: Motor,
  prompt: string,
  referencias: readonly ReferenciaDeFal[],
): Record<string, unknown> {
  const [primera] = referencias;
  if (primera === undefined) throw new Error(`${motor.nombre}: un atlas sin referencias`);
  return motor.control === true
    ? { prompt, control_lora_image_url: primera.uri, ...motor.params }
    : { prompt, image_urls: referencias.map((r) => r.uri), ...motor.params };
}

/**
 * Una referencia como data URI: la pose (y su profundidad) en PNG y a su tamaño,
 * que es la que manda; la identidad y el estilo, en JPEG y a `LADO_DE_REFERENCIA`
 * como mucho, para que la llamada no pese decenas de megas.
 */
export async function aDataUri(
  png: string,
  papel: ReferenciaDeFal['papel'],
): Promise<ReferenciaDeFal> {
  const dePose = papel === 'pose' || papel === 'pose-profundidad' || papel === 'profundidad';
  const bytes = dePose
    ? await sharp(png).png().toBuffer()
    : await sharp(png)
        .flatten({ background: '#808080' })
        .resize(LADO_DE_REFERENCIA, LADO_DE_REFERENCIA, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 90 })
        .toBuffer();
  return { papel, uri: `data:image/${dePose ? 'png' : 'jpeg'};base64,${bytes.toString('base64')}` };
}

/**
 * El cliente de fal del taller: la clave de `FAL_KEY` o del `.env` de
 * `TALLER_FAL_ENV`, el gasto en el `spend.json` de `tools/gen/` y el tope de
 * `TALLER_FAL_TOPE` (20 $ por defecto, el presupuesto de las pruebas).
 */
function cliente(): FalClient {
  const tope = Number(process.env.TALLER_FAL_TOPE ?? '20');
  if (!(tope > 0)) throw new Error(`TALLER_FAL_TOPE no es un número de dólares: ${tope}`);
  return new FalClient({
    cacheDir: join(RAIZ, 'tools/gen/.cache'),
    spendFile: join(RAIZ, 'tools/gen/spend.json'),
    budgetUsd: tope,
    ...(process.env.TALLER_FAL_ENV === undefined ? {} : { envPath: process.env.TALLER_FAL_ENV }),
  });
}

/** Pinta un encargo con su motor: lo mismo que `generar` de codex, con el crudo en la caché de fal. */
export async function generarConFal(
  encargo: Encargo,
  prompt: string,
  referencias: readonly { readonly papel: ReferenciaDeFal['papel']; readonly png: string }[],
): Promise<Generacion> {
  const motor = encargo.motor;
  if (motor === undefined) throw new Error(`${encargo.id} no lleva motor de fal`);
  const carga = cargaDeFal(
    motor,
    prompt,
    await Promise.all(referencias.map((r) => aDataUri(r.png, r.papel))),
  );
  const intento = motor.intento === undefined ? '' : `intento-${motor.intento}`;
  const { path, cached } = await cliente().image(
    motor.endpoint,
    carga,
    motor.coste,
    encargo.id,
    intento,
  );
  return {
    hilo: `fal:${FalClient.key(motor.endpoint, carga, intento)}`,
    crudo: path,
    mensaje: cached ? 'de la caché de fal' : `${motor.endpoint}, ${motor.coste} $`,
    coste: motor.coste,
  };
}
