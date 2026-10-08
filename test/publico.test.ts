/**
 * Lo que `vite build` copia de `assets/` (#137): todo menos lo que en las
 * carpetas `dN/` de una unidad solo lee el taller. El riesgo de un filtro así es
 * dejar fuera algo que la página sí pide, y eso se vería solo en la página
 * construida —una figura pintada con su marcador—, así que se comprueba contra
 * las URL que de verdad piden las figuras.
 */
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { juegosDelYBot, registrarUnidad } from '../src/client/render/personajes.js';
import { NOMBRES_DE_DIRECCION } from '../src/shared/arte.js';
import { direccionesDe } from '../tools/arena/borrador.js';
import { copiarPublico, seCopiaAlBuild } from '../tools/build/publico.js';

const RAIZ = join(import.meta.dirname, '..');
/** Una URL del navegador (`/unidades/…`) a su ruta dentro de `assets/`. */
const deLaUrl = (url: string): string => url.replace(/^\//, '');

describe('la carpeta pública en el build', () => {
  it('copia toda imagen que pide una figura: el atlas de cada dirección y las poses del Y Bot', () => {
    const id = 'templario-escudo';
    const propio = registrarUnidad(id, {
      juego: 'espada-escudo',
      direcciones: direccionesDe(RAIZ, id).direcciones,
    });
    expect(propio.propio).toBe(true);
    const urls = [
      ...propio.imagenes,
      ...juegosDelYBot().flatMap(
        (j) => registrarUnidad(`prueba-${j}`, { juego: j, direcciones: null }).imagenes,
      ),
    ];
    expect(urls.length).toBeGreaterThan(NOMBRES_DE_DIRECCION.length);
    for (const url of urls) expect(seCopiaAlBuild(deLaUrl(url)), url).toBe(true);
  });

  it('deja fuera las hojas, sus procedencias y los JSON del corte de cada dirección', () => {
    for (const f of [
      'hoja-a.webp',
      'hoja-b.webp',
      'hoja-c.webp',
      'hoja-a.procedencia.json',
      'atlas.json',
      'atlas.composicion.json',
    ]) {
      expect(seCopiaAlBuild(`unidades/templario-escudo/d3/${f}`), f).toBe(false);
    }
  });

  it('lo demás va entero: la identidad y el giro de la unidad, las poses del Y Bot, el resto del arte', () => {
    for (const r of [
      'unidades/templario-escudo/identidad.webp',
      'unidades/templario-escudo/giro.procedencia.json',
      'unidades/_poses/espada-escudo-8d/d0-a.png',
      'unidades/_poses/atlas-8d.json',
      'generated/manifest.json',
      'mapa/acantilado-arena-ancho-1.procedencia.json',
    ]) {
      expect(seCopiaAlBuild(r), r).toBe(true);
    }
  });

  describe('la copia', () => {
    let dir: string | null = null;
    afterEach(() => {
      if (dir !== null) rmSync(dir, { recursive: true, force: true });
      dir = null;
    });

    it('copia el árbol con el filtro, carpeta a carpeta', () => {
      dir = mkdtempSync(join(tmpdir(), 'heroes-publico-'));
      const origen = join(dir, 'assets');
      const destino = join(dir, 'dist');
      const ficheros = [
        'unidades/u/d0/atlas.webp',
        'unidades/u/d0/hoja-a.webp',
        'unidades/u/d0/atlas.json',
        'unidades/u/identidad.webp',
        'unidades/_poses/baston-8d/d0-a.png',
        'iconos/oro.png',
      ];
      for (const f of ficheros) {
        mkdirSync(dirname(join(origen, f)), { recursive: true });
        writeFileSync(join(origen, f), f);
      }
      copiarPublico(origen, destino);
      const copiados = (
        readdirSync(destino, { recursive: true, withFileTypes: true }) as {
          isFile(): boolean;
          parentPath: string;
          name: string;
        }[]
      )
        .filter((e) => e.isFile())
        .map((e) => relative(destino, join(e.parentPath, e.name)))
        .sort();
      expect(copiados).toEqual(
        [
          'iconos/oro.png',
          'unidades/_poses/baston-8d/d0-a.png',
          'unidades/u/d0/atlas.webp',
          'unidades/u/identidad.webp',
        ].sort(),
      );
    });
  });
});
