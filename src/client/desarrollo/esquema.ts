/**
 * La forma de una marca de fallo, en un solo sitio: de estos esquemas salen los
 * tipos (`tipos.ts`, con `z.infer`), y con ellos valida `tools/marcas/almacen.ts`
 * lo que manda el cliente y lo que lee del disco.
 *
 * Sin nada de `node:*`: el recorte se reconoce como PNG con `atob`, que tienen
 * el navegador y Node, así que el esquema no tiene que partirse en dos.
 */

import { TERRAIN_KINDS } from '@core/map/terrain.js';
import { z } from 'zod';
import { CLASES_DE_SPRITE } from '../render/escenario/colocar.js';
import { CLASES_DE_PUENTE, EJES_DE_PUENTE } from '../render/escenario/puentes.js';

/** Lo que es un id de marca: `AAAAMMDD-HHMMSS-s<semilla>-<x>-<y>`. Ni barras ni puntos. */
export const FORMA_DEL_ID = /^\d{8}-\d{6}-s\d+-\d+-\d+$/;

const numero = z.number().finite();
const punto = z.object({ x: numero, y: numero });
const caja = z.tuple([numero, numero, numero, numero]).readonly();
const objeto = z.object({ id: z.string(), kind: z.string() }).nullable();

/** Lo que hay en un punto y su casilla (`queHayEn`). */
export const esquemaDeQueHay = z.object({
  terreno: z.enum(TERRAIN_KINDS),
  suelo: z.string(),
  nivel: numero,
  /** Si la escena pinta agua en la casilla (`Escena.agua`, la lista de casillas de agua). */
  agua: z.boolean(),
  /** Los sprites cuya caja contiene el punto o corta la casilla, en el orden de la escena. */
  sprites: z.array(
    z.object({
      clase: z.enum(CLASES_DE_SPRITE),
      src: z.string().nullable(),
      /** La hoja y el módulo del catálogo de los que sale, si sale de una hoja. */
      hoja: z.string().nullable(),
      modulo: z.string().nullable(),
      /** La pieza suelta del catálogo (`puente-piedra-ns`, `cofre`…), si es una. */
      pieza: z.string().nullable(),
      /** Si es un módulo de ladera (`laderas-*`). */
      ladera: z.boolean(),
      recorte: caja.nullable(),
      /** Lo que ocupa la imagen, en casillas (`cajaDeSprite`). */
      caja,
      /** El ancla, en casillas. */
      ancla: z.tuple([numero, numero]).readonly(),
      alto: numero,
      tono: z.string().nullable(),
      capa: z.union([z.literal(0), z.literal(1)]),
      objeto,
      /** Si su caja contiene el punto exacto, y no solo corta su casilla. */
      cubrePunto: z.boolean(),
    }),
  ),
  /** Las caras de acantilado cuya banda corta la casilla. */
  caras: z.array(
    z.object({
      y: numero,
      x0: numero,
      x1: numero,
      caida: numero,
      material: z.string(),
      banda: caja,
      /**
       * Los tramos en x que no se pintan, `[a, b]`: donde ninguna pared la tapa
       * (`CaraDeEscena.pintada`).
       */
      abierto: z.array(z.tuple([numero, numero]).readonly()),
    }),
  ),
  /**
   * Las paredes del relieve por celdas cuya celda corta la casilla (R4), con su
   * vértice, su tipo y su caída.
   */
  celdas: z.array(
    z.object({
      vx: numero,
      vy: numero,
      tipo: z.string(),
      caida: numero,
      material: z.string(),
    }),
  ),
  /** Las bajadas cuyo `arriba` cae en la casilla (R5). */
  bajadas: z.array(
    z.object({
      rumbo: z.string(),
      caida: numero,
      material: z.string(),
      arriba: z.tuple([numero, numero]).readonly(),
    }),
  ),
  puente: z
    .object({
      id: z.string(),
      pieza: z.string(),
      eje: z.enum(EJES_DE_PUENTE),
      clase: z.enum(CLASES_DE_PUENTE),
      nodo: z.tuple([numero, numero]).readonly(),
      escala: numero,
    })
    .nullable(),
  /**
   * Cuántos sprites tiene la escena entera: si el taller compone otra cuenta,
   * su recorte no es el de la marca (el catálogo del disco y el del juego
   * difieren), y `pnpm marcas recorte` lo avisa.
   */
  spritesDeLaEscena: z.number().int().nonnegative(),
});

/** Los ocho bytes con que empieza todo PNG. */
const FIRMA_PNG = '\x89PNG\r\n\x1a\n';

/** Lo que manda el cliente al guardar: la marca sin lo que pone el servidor. */
export const esquemaDeMarcaNueva = z.object({
  semilla: z.number().int({ message: 'la semilla de una marca es un entero' }),
  dia: z.number().int().positive({ message: 'el día de una marca empieza en 1' }),
  /** La casilla del clic: la que señala el puntero, el nodo si se pulsa un puente. */
  casilla: z.object({ x: z.number().int().nonnegative(), y: z.number().int().nonnegative() }),
  /** El punto exacto del clic, en casillas con decimales (coordenadas del mundo). */
  punto,
  /** La cámara de ese momento: zoom (`tile`, px CSS por casilla) y esquina. */
  camara: z.object({ tile: numero.positive(), x: numero, y: numero }),
  /**
   * El lienzo: caja en px CSS, densidad de la pantalla (`dpr`) y la que de
   * verdad se pintó (`densidad`, menor si el presupuesto de píxeles la bajó).
   */
  lienzo: z.object({
    ancho: numero.positive(),
    alto: numero.positive(),
    dpr: numero.positive(),
    densidad: numero.positive(),
  }),
  /** Lo que cubre el PNG, en coordenadas del mundo: `[x0, y0, x1, y1]`. */
  recorte: caja,
  nota: z
    .string()
    .trim()
    .min(1, { message: 'una marca sin nota no dice qué falla: escribe qué ves' }),
  /** El objeto del mapa en la casilla, si hay uno. */
  objeto,
  queHay: esquemaDeQueHay,
  /** El recorte de la pantalla, PNG en base64 (sin `data:`). */
  png: z
    .string()
    .regex(/^[A-Za-z0-9+/]+={0,2}$/, { message: 'el recorte no es un PNG en base64' })
    // Doce caracteres de base64 son nueve bytes: la firma entera y uno más.
    .refine(
      (b64) => /^[A-Za-z0-9+/]{12}/.test(b64) && atob(b64.slice(0, 12)).startsWith(FIRMA_PNG),
      {
        message: 'el recorte llegó en base64 pero no es un PNG',
      },
    ),
});

/**
 * Una marca en disco (`docs/revision/marcas/<id>.json`). Está pendiente
 * mientras `resuelta` es `null`: el estado no se escribe aparte.
 */
export const esquemaDeMarca = esquemaDeMarcaNueva.omit({ png: true }).extend({
  id: z.string().regex(FORMA_DEL_ID),
  /** ISO 8601, la pone el servidor al guardar. */
  fecha: z.string().datetime(),
  /** Con qué se resolvió: una issue (`#160`) o un commit; `null` mientras está pendiente. */
  resuelta: z.object({ ref: z.string().min(1), fecha: z.string().datetime() }).nullable(),
  /** El fichero del recorte, junto al JSON. */
  png: z.string(),
});

/** El motivo de un fallo, para la barra, la consola o la respuesta del servidor. */
export const motivoDe = (err: unknown): string =>
  err instanceof Error ? err.message : String(err);

/** La primera frase de un fallo de zod, con el campo delante: lo que lee la persona. */
export function fraseDe(err: z.ZodError): string {
  const [primero] = err.issues;
  if (primero === undefined) return 'la marca no es válida';
  const campo = primero.path.join('.');
  // Los mensajes por defecto de zod van en inglés («Required»): los de tipo,
  // que son los que salen de un cuerpo mal formado, se dicen aquí.
  const mensaje =
    primero.code === 'invalid_type'
      ? primero.received === 'undefined'
        ? 'falta'
        : `es ${primero.received} y tiene que ser ${primero.expected}`
      : primero.message;
  return campo === '' ? `la marca ${mensaje}` : `${campo}: ${mensaje}`;
}
