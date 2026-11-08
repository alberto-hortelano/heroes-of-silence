/**
 * Páginas de revisión del taller, en `.cache/taller/vista/`: los ejércitos. Lo
 * que se le enseña al usuario ANTES de engancharlo al juego (las de los efectos
 * y los edificios se retiraron con ellos el 06-11-2026).
 *
 * Las unidades se revisan animadas en el visor de 8 direcciones
 * (`pnpm taller vista-8d`); aquí salen por su lámina de identidad. La lámina
 * animada de una dirección (`pnpm taller vista <id>`) se retiró el 03-10-2026
 * con el `atlas.webp` de una dirección que leía.
 *
 * Que la lámina se vea bien NO es la aceptación: la aceptación es del usuario,
 * con capturas del juego.
 */
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { NOMBRE_DE_FACCION } from '../../src/core/types.js';
import { RAIZ } from '../comun/raiz.js';

export const DIR_VISTA = join(RAIZ, '.cache/taller/vista');

/** La lámina de identidad de una unidad, si la tiene: es lo que la presenta. */
const conIdentidad = (id: string): boolean =>
  existsSync(join(RAIZ, 'assets/unidades', id, 'identidad.webp'));

/**
 * La página de todos los ejércitos (`ejercitos.html`): una columna por facción
 * con la lámina de identidad de cada tropa y cada héroe. Se abre con `file://`:
 * las imágenes se leen de `assets/` con una ruta relativa, así que enseña
 * siempre las de ahora.
 */
export async function vistaEjercitos(): Promise<string> {
  const { HEROES, UNIDADES, EN_OCHO_DIRECCIONES } = await import('./unidades.js');
  const R = '../../../assets';
  const tarjeta = (u: { id: string; nombre: string }): string =>
    `<figure><img src="${R}/unidades/${u.id}/identidad.webp" alt=""><figcaption>${u.nombre}<span>${u.id}${EN_OCHO_DIRECCIONES[u.id] === undefined ? '' : ' · 8 direcciones'}</span></figcaption></figure>`;
  const columnas = Object.entries(NOMBRE_DE_FACCION)
    .map(([fac, nombre]) => {
      const tropas = UNIDADES.filter((u) => u.faccion === fac && conIdentidad(u.id));
      const heroes = HEROES.filter((u) => u.faccion === fac && conIdentidad(u.id));
      if (tropas.length + heroes.length === 0) return '';
      return `<section><h2>${nombre}</h2>${tropas.map(tarjeta).join('')}<h3>Héroes</h3>${heroes.map(tarjeta).join('')}</section>`;
    })
    .join('');
  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>Taller · ejércitos</title>
<style>
  body { margin: 0; background: #1b1d16; color: #e8e2cf; font: 14px system-ui, sans-serif; }
  main { display: flex; gap: 12px; padding: 12px 16px; align-items: flex-start; overflow-x: auto; }
  section { min-width: 220px; flex: 1; }
  h2, h3 { margin: 6px 0; }
  figure { margin: 0 0 10px; background: #2a2d22; border-radius: 6px; overflow: hidden; }
  figure img { display: block; width: 100%; height: 220px; object-fit: contain; background: url(${R}/rpg/campo.webp) center 70%; background-size: 170%; }
  figcaption { padding: 6px 10px; display: flex; justify-content: space-between; gap: 8px; }
  figcaption span { color: #b9b29a; text-align: right; font-size: 12px; }
</style></head><body><main>${columnas}</main></body></html>
`;
  await mkdir(DIR_VISTA, { recursive: true });
  const ruta = join(DIR_VISTA, 'ejercitos.html');
  await writeFile(ruta, html);
  return ruta;
}
