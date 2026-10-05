/**
 * El pintor del suelo del mapa, en un Worker: lo que se pinta una vez por
 * partida —texturas, relieve, agua, sendas, lo plano y la luz— fuera del hilo
 * principal.
 *
 * Pintarlo en el hilo principal era una sola tarea de 1,7-2,2 s al empezar la
 * partida, en cada «Partida nueva» y al abrir el espectador: durante ese rato la
 * página no respondía a nada y un clic se perdía (H2 de la vuelta 1 de QA). Aquí
 * es el MISMO `pintarSuelo` sobre un `OffscreenCanvas`, con las imágenes como
 * `ImageBitmap` que el Worker pide él mismo: el hilo principal no descarga ni
 * decodifica ninguna textura del suelo.
 *
 * Recibe una `PeticionDelSuelo` y contesta primero con lo que no le llegó y
 * luego con un `MensajeDelSuelo` por cada superficie, en orden, transfiriéndola.
 * Quien lo arranca le pide una sola y lo termina al recibirla (`enUnWorker`, en
 * `superficie.ts`): con él se va la memoria de las texturas y de las máscaras,
 * que un Worker vivo no soltaba antes de pintar la siguiente.
 */
import { urlDeImagenSegura } from '../../html.js';
import type { Escena } from './colocar.js';
import { horneado } from './horneado.js';
import {
  type EscenaSeparada,
  type Imagen,
  imagenesDelSuelo,
  type Lienzo,
  lienzoCon,
  olvidarEntonadas,
  pintarSuelo,
  separar,
} from './pintar.js';

export interface PeticionDelSuelo {
  readonly escena: Escena;
  /** Píxeles por casilla de cada superficie, en el orden en que se pintan. */
  readonly px: readonly number[];
  /** De dónde se piden las imágenes de la escena: la URL absoluta de `assets/mapa/`. */
  readonly base: string;
}

/** Lo que contesta el Worker: primero lo que no llegó, luego cada superficie, o el fallo. */
export type MensajeDelSuelo =
  | {
      readonly imagenes: number;
      /** Las que no llegaron ni al volver a pedirlas, con su motivo: salen con su color plano. */
      readonly faltan: readonly string[];
    }
  | { readonly px: number; readonly lienzo: ImageBitmap }
  | { readonly error: string };

/**
 * Una imagen de la escena como `ImageBitmap`, o el motivo por el que no llegó.
 * Se pide dos veces antes de rendirse, que es lo que hacía el suelo cuando se
 * pintaba en el hilo principal.
 */
async function cargar(base: string, src: string): Promise<ImageBitmap | string> {
  const url = urlDeImagenSegura(new URL(src, base).href);
  let motivo = '';
  for (let intento = 0; intento < 2; intento++) {
    try {
      const r = await fetch(url);
      if (!r.ok) {
        motivo = `${src}: HTTP ${r.status}`;
        continue;
      }
      return await createImageBitmap(await r.blob());
    } catch (err) {
      motivo = `${src}: ${err instanceof Error ? err.message : String(err)}`;
    }
  }
  return motivo;
}

/**
 * El suelo de una escena a `px` por casilla. Es la pintura misma, la que hace el
 * Worker y, sin él, el hilo principal: las dos salen iguales al píxel con las
 * mismas imágenes. Las copias entonadas que deja (`olvidarEntonadas`) sirven a
 * la siguiente resolución: las suelta quien pinta la última.
 */
export function pintarSueloA(
  escena: Escena,
  separada: EscenaSeparada,
  px: number,
  imagen: (src: string) => Imagen | undefined,
): Lienzo {
  const { lienzo, c } = lienzoCon(escena.W * px, escena.H * px);
  // Un `ImageBitmap` no se muestrea como un `<img>`: el navegador decodifica el
  // `<img>` a la escala a la que se pinta, y el mapa de bits se reduce entero.
  // Con el muestreo de por defecto, el suelo salía más áspero que cuando se
  // pintaba con `<img>` (semilla 1, 72 px: 12 % de píxeles a más de 16 niveles,
  // media 4,9); con `medium`, 4,1 % y media 2,8. Igual al píxel no sale con
  // ninguno.
  c.imageSmoothingQuality = 'medium';
  pintarSuelo(c, escena, separada, { tile: px, imagen, objeto: horneado });
  return lienzo;
}

/**
 * Pinta el suelo de `p` a cada una de sus resoluciones y se lo `envia` a quien
 * lo pidió, mensaje a mensaje. Exportada para probarla sin Worker.
 */
export async function pintarSueloAparte(
  p: PeticionDelSuelo,
  enviar: (m: MensajeDelSuelo, transferir?: Transferable[]) => void,
): Promise<void> {
  const { escena } = p;
  const separada = separar(escena, { objeto: horneado });
  const srcs = imagenesDelSuelo(escena, separada);
  const cargadas = await Promise.all(srcs.map((src) => cargar(p.base, src)));
  const imagenes = new Map<string, ImageBitmap>();
  const faltan: string[] = [];
  cargadas.forEach((c, i) => {
    if (typeof c === 'string') faltan.push(c);
    else imagenes.set(srcs[i] as string, c);
  });
  enviar({ imagenes: srcs.length, faltan });
  try {
    for (const px of p.px) {
      const lienzo = pintarSueloA(escena, separada, px, (src) => imagenes.get(src));
      if (!('transferToImageBitmap' in lienzo))
        throw new Error('el pintor del suelo necesita OffscreenCanvas para devolver lo pintado');
      const pintado = lienzo.transferToImageBitmap();
      enviar({ px, lienzo: pintado }, [pintado]);
    }
  } finally {
    for (const im of imagenes.values()) im.close();
    olvidarEntonadas();
  }
}

/** El ámbito del Worker, con lo poco que se usa de él: sin `lib: webworker`, que choca con el DOM. */
interface AmbitoDelWorker {
  addEventListener(tipo: 'message', fn: (e: MessageEvent<PeticionDelSuelo>) => void): void;
  postMessage(m: MensajeDelSuelo, transferir?: Transferable[]): void;
}

// Solo se escucha si de verdad es un Worker: importado desde un test, no hace nada.
if (typeof document === 'undefined' && typeof self !== 'undefined' && 'postMessage' in self) {
  const ambito = self as unknown as AmbitoDelWorker;
  ambito.addEventListener('message', (e) => {
    pintarSueloAparte(e.data, (m, transferir) => ambito.postMessage(m, transferir ?? [])).catch(
      (err: unknown) =>
        ambito.postMessage({ error: err instanceof Error ? err.message : String(err) }),
    );
  });
}
