/**
 * Páginas de revisión del taller, en `.cache/taller/vista/`: los ejércitos, los
 * efectos y los edificios. Lo que se le enseña al usuario ANTES de engancharlo
 * al juego.
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
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { NOMBRE_DE_FACCION_DE_ARENA } from '../../src/core/arena.js';

const RAIZ = resolve(import.meta.dirname, '../..');
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
  const columnas = Object.entries(NOMBRE_DE_FACCION_DE_ARENA)
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

/**
 * La página de revisión de los efectos de batalla: cada efecto animado en bucle
 * sobre una casilla del campo, con una figura al lado para la escala; los
 * iconos a 32 px (como se pintarán) y a 96 px; y los sprites quietos.
 */
export async function vistaEfectos(): Promise<string> {
  const { readdir } = await import('node:fs/promises');
  const base = join(RAIZ, 'assets/efectos');
  const animados = (await readdir(join(base, 'animados')))
    .filter((f) => f.endsWith('.json') && !f.endsWith('.procedencia.json'))
    .map((f) => f.slice(0, -5));
  // Los iconos pueden no existir todavía (la lámina va aparte): la página lo dice.
  const rutaIconos = join(base, 'iconos/iconos.json');
  const iconos = existsSync(rutaIconos)
    ? (JSON.parse(await readFile(rutaIconos, 'utf8')) as {
        iconos: { nombre: string; imagen: string }[];
      })
    : { iconos: [] };
  const rutaRecursos = join(RAIZ, 'assets/iconos/recursos/recursos.json');
  const recursos = existsSync(rutaRecursos)
    ? (JSON.parse(await readFile(rutaRecursos, 'utf8')) as {
        iconos: { nombre: string; imagen: string }[];
      })
    : { iconos: [] };
  const quietos = (await readdir(base))
    .filter((f) => f.endsWith('.webp'))
    .map((f) => f.slice(0, -5));
  const datos = await Promise.all(
    animados.map(async (id) => ({
      id,
      ...(JSON.parse(await readFile(join(base, 'animados', `${id}.json`), 'utf8')) as object),
    })),
  );
  const R = '../../../assets';
  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>Taller · efectos</title>
<style>
  body { margin: 0; background: #1b1d16; color: #e8e2cf; font: 14px system-ui, sans-serif; }
  h2 { font-size: 16px; padding: 12px 16px 0; margin: 0; }
  .rejilla { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 12px; padding: 12px 16px; }
  figure { margin: 0; background: #2a2d22; border-radius: 6px; overflow: hidden; }
  figcaption { padding: 6px 10px; }
  canvas { display: block; width: 100%; background: url(${R}/rpg/campo.webp) center 70%; background-size: 170%; background-color: #7a7aa4; }
  .iconos { display: flex; flex-wrap: wrap; gap: 14px; padding: 12px 16px; }
  .icono { background: #2a2d22; border-radius: 6px; padding: 8px; text-align: center; width: 120px; }
  .icono img { display: block; margin: 4px auto; }
  .quieto img { width: 100%; height: 220px; object-fit: contain; background: url(${R}/rpg/campo.webp) center 70%; background-size: 170%; }
</style></head><body>
<h2>Efectos animados (en bucle; en el juego salen una vez)</h2>
<div class="rejilla" id="animados"></div>
<h2>Iconos de estado, a 32 px y a 96 px</h2>
<div class="iconos">${iconos.iconos.length === 0 ? '<p>Todavía no hay lámina de iconos.</p>' : ''}${iconos.iconos
    .map(
      (i) =>
        `<div class="icono"><img src="${R}/efectos/iconos/${i.imagen}" width="32" height="32"><img src="${R}/efectos/iconos/${i.imagen}" width="96" height="96">${i.nombre}</div>`,
    )
    .join('')}</div>
<h2>Iconos de recursos, a 20 px (como en la barra) y a 64 px</h2>
<div class="iconos">${recursos.iconos.length === 0 ? '<p>Todavía no hay iconos de recursos.</p>' : ''}${recursos.iconos
    .map(
      (i) =>
        `<div class="icono"><img src="${R}/iconos/recursos/${i.imagen}" width="20" height="20"><img src="${R}/iconos/recursos/${i.imagen}" width="64" height="64">${i.nombre}</div>`,
    )
    .join('')}</div>
<h2>Sprites quietos</h2>
<div class="rejilla">${quietos
    .map(
      (q) =>
        `<figure class="quieto"><img src="${R}/efectos/${q}.webp"><figcaption>${q}</figcaption></figure>`,
    )
    .join('')}</div>
<script>
const EFECTOS = ${JSON.stringify(datos)};
// El templario de escudo de frente-derecha (d1), su primer reposo: celda de 384.
const figura = new Image(); figura.src = '${R}/unidades/templario-escudo/d1/atlas.webp';
const piezas = EFECTOS.map((e) => {
  const fig = document.createElement('figure');
  const c = document.createElement('canvas'); c.width = 400; c.height = 300;
  const cap = document.createElement('figcaption'); cap.textContent = e.id + ' · ' + e.fotogramas + ' fotogramas';
  fig.append(c, cap); document.getElementById('animados').append(fig);
  const img = new Image(); img.src = '${R}/efectos/animados/' + e.id + '.webp';
  return { e, c, img };
});
const t0 = performance.now();
function dibujar(ahora) {
  const t = (ahora - t0) / 1000;
  for (const { e, c, img } of piezas) {
    const ctx = c.getContext('2d'); ctx.clearRect(0, 0, c.width, c.height);
    // La casilla: una elipse a 25°.
    ctx.strokeStyle = 'rgba(255,240,200,0.5)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(220, 230, 60, 26, 0, 0, Math.PI * 2); ctx.stroke();
    if (figura.complete && figura.naturalWidth) ctx.drawImage(figura, 0, 0, 384, 384, 20, 60, 240, 240);
    if (!img.complete || !img.naturalWidth) continue;
    const i = Math.floor(t * 10) % (e.fotogramas + 4); // 10 fps y una pausa
    if (i < e.fotogramas) ctx.drawImage(img, i * e.celda, 0, e.celda, e.celda, 120, 60, 200, 200);
  }
  requestAnimationFrame(dibujar);
}
requestAnimationFrame(dibujar);
</script></body></html>
`;
  const ruta = join(DIR_VISTA, 'efectos.html');
  await mkdir(DIR_VISTA, { recursive: true });
  await writeFile(ruta, html);
  return ruta;
}

/** La página de revisión de los edificios de ciudad, agrupados por facción. */
export async function vistaEdificios(): Promise<string> {
  const { EDIFICIOS } = await import('./edificios.js');
  const { UNIDADES } = await import('./unidades.js');
  const R = '../../../assets';
  const secciones = Object.entries(NOMBRE_DE_FACCION_DE_ARENA)
    .map(([fac, nombre]) => {
      const lista = EDIFICIOS.filter(
        (e) => e.faccion === fac && existsSync(join(RAIZ, `assets/edificios/${fac}/${e.id}.webp`)),
      );
      if (lista.length === 0) return '';
      // Una tropa de la facción al lado, a escala de figura, para juzgar el tamaño.
      const tropa = UNIDADES.find((u) => u.faccion === fac);
      const figura =
        tropa === undefined
          ? ''
          : `<img class="figura" src="${R}/unidades/${tropa.id}/identidad.webp" alt="">`;
      return `<h2>${nombre}</h2><div class="rejilla">${lista
        .map(
          (e) =>
            `<figure><div class="escena"><img src="${R}/edificios/${fac}/${e.id}.webp">${figura}</div><figcaption><strong>${e.nombre}</strong><span>${e.produce}</span></figcaption></figure>`,
        )
        .join('')}</div>`;
    })
    .join('');
  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>Taller · edificios</title>
<style>
  body { margin: 0; background: #1b1d16; color: #e8e2cf; font: 14px system-ui, sans-serif; }
  h2 { font-size: 16px; padding: 14px 16px 0; margin: 0; }
  .rejilla { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 12px; padding: 12px 16px; }
  figure { margin: 0; background: #2a2d22; border-radius: 6px; overflow: hidden; }
  figcaption { padding: 6px 10px; display: flex; justify-content: space-between; gap: 8px; }
  figcaption span { color: #b9b29a; text-align: right; }
  .escena { position: relative; height: 300px; background: url(${R}/rpg/suelo.webp); }
  .escena img { position: absolute; left: 6%; bottom: 8%; width: 70%; height: 84%; object-fit: contain; object-position: bottom; }
  /* La lámina de identidad de una tropa de la facción, a escala de figura. */
  .escena img.figura { position: absolute; left: auto; right: 4%; bottom: 6%; width: 110px; height: 160px; object-fit: contain; object-position: bottom; }
</style></head><body>${secciones}</body></html>
`;
  const ruta = join(DIR_VISTA, 'edificios.html');
  await mkdir(DIR_VISTA, { recursive: true });
  await writeFile(ruta, html);
  return ruta;
}
