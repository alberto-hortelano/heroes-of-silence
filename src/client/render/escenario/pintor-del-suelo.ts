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
 * Recibe una `PeticionDelSuelo` y contesta con una `RespuestaDelSuelo`, una vez:
 * quien lo arranca lo termina al recibirla, y con él se va la memoria de las
 * texturas.
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
  /** Píxeles por casilla de la superficie. */
  readonly px: number;
  /** De dónde se piden las imágenes de la escena: la URL absoluta de `assets/mapa/`. */
  readonly base: string;
}

export type RespuestaDelSuelo =
  | {
      readonly entero: ImageBitmap;
      /** La misma superficie a la mitad: la que se copia por debajo de 50 px por casilla. */
      readonly mitad: ImageBitmap;
      readonly imagenes: number;
      /** Las que no llegaron ni al volver a pedirlas, con su motivo: salen con su color plano. */
      readonly faltan: readonly string[];
    }
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
 * El suelo de una escena a `px` por casilla, y su mitad. Es la pintura misma, la
 * que hace el Worker y, sin él, el hilo principal: las dos salen iguales al píxel
 * con las mismas imágenes.
 */
export function pintarSueloConSuMitad(
  escena: Escena,
  separada: EscenaSeparada,
  px: number,
  imagen: (src: string) => Imagen | undefined,
): { readonly entero: Lienzo; readonly mitad: Lienzo } {
  const { lienzo, c } = lienzoCon(escena.W * px, escena.H * px);
  // Un `ImageBitmap` no se muestrea como un `<img>`: el navegador decodifica el
  // `<img>` a la escala a la que se pinta, y el mapa de bits se reduce entero.
  // Con el muestreo de por defecto, el suelo salía más áspero que cuando se
  // pintaba con `<img>` (semilla 1, 72 px: 12 % de píxeles a más de 16 niveles,
  // media 4,9); con `medium`, 4,1 % y media 2,8. Igual al píxel no sale con
  // ninguno.
  c.imageSmoothingQuality = 'medium';
  pintarSuelo(c, escena, separada, { tile: px, imagen, objeto: horneado });
  // Reducir la de 72 a cada arrastre costaba 12,7 ms: la mitad se saca una vez.
  const mitad = lienzoCon(Math.ceil(lienzo.width / 2), Math.ceil(lienzo.height / 2));
  mitad.c.imageSmoothingEnabled = true;
  mitad.c.imageSmoothingQuality = 'high';
  mitad.c.drawImage(lienzo, 0, 0, mitad.lienzo.width, mitad.lienzo.height);
  olvidarEntonadas();
  return { entero: lienzo, mitad: mitad.lienzo };
}

/** Pinta el suelo de `p` y lo devuelve. Exportada para probarla sin Worker. */
export async function pintarSueloAparte(p: PeticionDelSuelo): Promise<RespuestaDelSuelo> {
  const { escena, px } = p;
  const separada = separar(escena, { objeto: horneado });
  const srcs = imagenesDelSuelo(escena, separada);
  const cargadas = await Promise.all(srcs.map((src) => cargar(p.base, src)));
  const imagenes = new Map<string, ImageBitmap>();
  const faltan: string[] = [];
  cargadas.forEach((c, i) => {
    if (typeof c === 'string') faltan.push(c);
    else imagenes.set(srcs[i] as string, c);
  });
  const { entero, mitad } = pintarSueloConSuMitad(escena, separada, px, (src) => imagenes.get(src));
  for (const im of imagenes.values()) im.close();
  if (!('transferToImageBitmap' in entero) || !('transferToImageBitmap' in mitad))
    throw new Error('el pintor del suelo necesita OffscreenCanvas para devolver lo pintado');
  return {
    entero: entero.transferToImageBitmap(),
    mitad: mitad.transferToImageBitmap(),
    imagenes: srcs.length,
    faltan,
  };
}

/** El ámbito del Worker, con lo poco que se usa de él: sin `lib: webworker`, que choca con el DOM. */
interface AmbitoDelWorker {
  addEventListener(tipo: 'message', fn: (e: MessageEvent<PeticionDelSuelo>) => void): void;
  postMessage(m: RespuestaDelSuelo, transferir?: Transferable[]): void;
}

// Solo se escucha si de verdad es un Worker: importado desde un test, no hace nada.
if (typeof document === 'undefined' && typeof self !== 'undefined' && 'postMessage' in self) {
  const ambito = self as unknown as AmbitoDelWorker;
  ambito.addEventListener('message', (e) => {
    pintarSueloAparte(e.data).then(
      (r) => ambito.postMessage(r, 'error' in r ? [] : [r.entero, r.mitad]),
      (err: unknown) =>
        ambito.postMessage({ error: err instanceof Error ? err.message : String(err) }),
    );
  });
}
