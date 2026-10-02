/**
 * Lo que una imagen del taller tiene que cumplir antes de salir de él. Son
 * condiciones TÉCNICAS: que pasen no la aprueba —la aceptación es visual y la
 * da el usuario con capturas—, pero que fallen la descarta sin enseñarla.
 */
import sharp from 'sharp';
import { FIGURA } from '../../src/shared/arte.js';
import { ALFA_FIGURA } from './empaquetar.js';
import { UMBRALES } from './recorte.js';

export interface Informe {
  readonly problemas: readonly string[];
  readonly medidas: Readonly<Record<string, number>>;
}

/** Medidas del alfa: cuánto cuerpo es opaco y cuánto halo queda suelto. */
function medirAlfa(data: Buffer, width: number, height: number): Record<string, number> {
  let visibles = 0;
  let opacos = 0;
  let sueltos = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const a = data[(y * width + x) * 4 + 3] as number;
      if (a === 0) continue;
      visibles++;
      if (a === 255) opacos++;
      if (a >= UMBRALES.halo) continue;
      // Un píxel tenue es canto si toca cuerpo; si no, es halo que se escapó.
      let tocaCuerpo = false;
      for (let dy = -2; dy <= 2 && !tocaCuerpo; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          if ((data[(ny * width + nx) * 4 + 3] as number) >= UMBRALES.cuerpo) {
            tocaCuerpo = true;
            break;
          }
        }
      }
      if (!tocaCuerpo) sueltos++;
    }
  }
  return {
    visibles: visibles / (width * height),
    opacos: visibles === 0 ? 0 : opacos / visibles,
    haloSuelto: visibles === 0 ? 0 : sueltos / visibles,
  };
}

export async function validar(
  imagen: Buffer,
  tipo: 'atlas' | 'identidad' | 'giro' | 'imagen' | 'iconos' | 'efecto',
  opaca = false,
  celda: number = FIGURA.celda,
  filas = 3,
): Promise<Informe> {
  const { data, info } = await sharp(imagen)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const problemas: string[] = [];
  if (opaca) return { problemas, medidas: { ancho: info.width, alto: info.height } };

  const medidas = medirAlfa(data, info.width, info.height);
  if ((medidas.visibles ?? 0) < 0.02) problemas.push('la imagen está casi vacía tras el recorte');
  if ((medidas.visibles ?? 0) > 0.9)
    problemas.push('el fondo no se ha recortado: casi todo es opaco');
  // Un efecto es semitransparente a propósito: ni cuerpo opaco ni halo que medir.
  if (tipo !== 'efecto' && (medidas.opacos ?? 0) < 0.75) {
    problemas.push(
      `el cuerpo no es opaco: solo el ${Math.round((medidas.opacos ?? 0) * 100)} % de lo visible`,
    );
  }
  if (tipo !== 'efecto' && (medidas.haloSuelto ?? 0) > 0.01) {
    problemas.push(
      `queda halo suelto: ${((medidas.haloSuelto ?? 0) * 100).toFixed(1)} % de lo visible`,
    );
  }

  if (tipo === 'atlas') {
    const { columnas } = FIGURA;
    if (info.width !== celda * columnas || info.height !== celda * filas) {
      problemas.push(
        `un atlas mide ${celda * columnas}×${celda * filas} y este ${info.width}×${info.height}`,
      );
    }
    // Ninguna figura toca el borde de su celda: se cortaría al dibujarla sola.
    for (let f = 0; f < filas; f++) {
      for (let c = 0; c < columnas; c++) {
        let toca = false;
        for (let i = 0; i < celda && !toca; i++) {
          for (const [x, y] of [
            [i, 0],
            [i, celda - 1],
            [0, i],
            [celda - 1, i],
          ] as const) {
            const a = data[((f * celda + y) * info.width + c * celda + x) * 4 + 3] as number;
            if (a >= ALFA_FIGURA) toca = true;
          }
        }
        if (toca)
          problemas.push(
            `la figura de la fila ${f + 1}, columna ${c + 1} toca el borde de su celda`,
          );
      }
    }
  }
  return { problemas, medidas: { ...medidas, ancho: info.width, alto: info.height } };
}
