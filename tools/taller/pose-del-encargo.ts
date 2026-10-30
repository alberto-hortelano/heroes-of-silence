/**
 * La pose contra la que se empaqueta una hoja de 8 direcciones (`EscalaDePose`):
 * las siluetas y los apoyos del maniquí en cada celda, su reposo y el tronco de su
 * esqueleto (C1). Aparte de `trabajador.ts`, que arranca la cola al importarse,
 * para que lo use quien empaqueta fuera de la cola (una medida, una prueba).
 */
import { join, resolve } from 'node:path';
import sharp from 'sharp';
import { type ClipDeFigura, FIGURA, HOJAS_DE_FIGURA } from '../../src/shared/arte.js';
import { OCHO_DIRECCIONES } from '../art/poses.js';
import { ELEVACION_DEL_CADAVER } from './derivar.js';
import { apoyoEn, type EscalaDePose } from './empaquetar.js';
import type { Encargo } from './encargo.js';
import { hojaDelReposo } from './poses-8d.js';
import { hojaDePose, huesosVigentes, poseDelEncargo, troncoDe } from './revision/maniqui.js';

const RAIZ = resolve(import.meta.dirname, '../..');

/**
 * Las siluetas del maniquí en cada celda de la hoja de pose de un encargo de 8
 * direcciones, y la de su reposo (la primera celda de la hoja A de su
 * dirección): con ellas se escalan igual todas las hojas de una figura.
 */
export async function escalaDePose(e: Encargo): Promise<EscalaDePose> {
  const celda: number = e.celda ?? FIGURA.celda;
  const medir = async (ruta: string) => {
    const { data, info } = await sharp(join(RAIZ, ruta))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const filas = info.height / celda;
    const columnas = info.width / celda;
    const alfa = (f: number, c: number) => (x: number, y: number) =>
      data[((f * celda + y) * info.width + c * celda + x) * 4 + 3] as number;
    const celdas = Array.from({ length: filas }, (_, f) =>
      Array.from({ length: columnas }, (_, c) => {
        let x0 = celda;
        let y0 = celda;
        let x1 = -1;
        let y1 = -1;
        for (let y = 0; y < celda; y++)
          for (let x = 0; x < celda; x++)
            if (alfa(f, c)(x, y) >= 40) {
              if (x < x0) x0 = x;
              if (x > x1) x1 = x;
              if (y < y0) y0 = y;
              y1 = y;
            }
        const silueta = new Uint8Array(celda * celda);
        for (let y = 0; y < celda; y++)
          for (let x = 0; x < celda; x++) silueta[y * celda + x] = alfa(f, c)(x, y) >= 40 ? 1 : 0;
        return {
          silueta,
          apoyo: apoyoEn(alfa(f, c), [x0, y0, x1, y1]),
        };
      }),
    );
    return celdas;
  };
  const clips: readonly ClipDeFigura[] | undefined =
    e.ocho === undefined ? undefined : HOJAS_DE_FIGURA[e.ocho.hoja];
  // La del maniquí: la que apunta `ocho.pose` (con `pose-esqueleto`), o su referencia de pose.
  const ruta = poseDelEncargo(e);
  if (ruta === undefined) throw new Error(`${e.id} no tiene referencia de pose`);
  const reposo = (await medir(hojaDelReposo(ruta)))[0]?.[0];
  if (reposo === undefined) throw new Error(`la pose ${ruta} no tiene reposo`);
  const celdas = await medir(ruta);
  // El tronco del maniquí en cada celda, de su esqueleto: con él C1 recoloca cada
  // fotograma (`encuadre.ts`). Sin esqueleto vigente, no hay C1, y se dice por qué.
  const hoja = hojaDePose(ruta);
  const vigentes =
    hoja === null
      ? { motivo: `${ruta} no es una hoja del maniquí` }
      : huesosVigentes(join(RAIZ, hoja.carpeta), hoja.d, hoja.h);
  const sinTronco =
    'motivo' in vigentes
      ? vigentes.motivo
      : vigentes.huesos.filas.map((f) => f.clip).join() !== clips?.join()
        ? 'las filas del esqueleto no son las de la hoja'
        : undefined;
  const caderas =
    sinTronco === undefined && 'huesos' in vigentes
      ? vigentes.huesos.filas.map((f) => f.celdas.map(troncoDe))
      : undefined;
  return {
    lado: celda,
    siluetas: celdas.map((f) => f.map((c) => c.silueta)),
    reposo: OCHO_DIRECCIONES.altoDelManiqui,
    apoyos: celdas.map((f) => f.map((c) => c.apoyo)),
    apoyoReposo: reposo.apoyo,
    // Fuera de la locomoción (los clips en bucle) la posición la manda el
    // maniquí: el ataque, el daño, la muerte y el disparo se pintan parados.
    posicion: clips !== undefined && !clips.some((c) => OCHO_DIRECCIONES.enBucle.includes(c)),
    // La muerte sube en su celda (ELEVACION_DEL_CADAVER), en la hoja que la lleve.
    ...(clips?.includes('death')
      ? { elevaciones: clips.map((c) => (c === 'death' ? ELEVACION_DEL_CADAVER : 0)) }
      : {}),
    ...(caderas === undefined ? {} : { caderas }),
    ...(sinTronco === undefined ? {} : { sinTronco }),
    ...(clips === undefined
      ? {}
      : { enBucle: clips.map((c) => OCHO_DIRECCIONES.enBucle.includes(c)) }),
  };
}
