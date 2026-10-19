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
import { FACTION_IDS } from '../src/core/types.js';
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

  it('de la base, copia las placas, los recortes y el índice, y deja fuera sus fuentes', () => {
    // La página pide `indice.json`, `suelo.webp`, `tramo-<n>.webp` y un recorte
    // por edificio (`render/base/arte.ts`); los maestros, las placas, las
    // ediciones, las guías y las hojas de identidad solo los lee el taller.
    for (const f of ['indice.json', 'suelo.webp', 'tramo-1.webp', 'village_hall.webp']) {
      expect(seCopiaAlBuild(`bases/knight/${f}`), f).toBe(true);
    }
    for (const f of [
      'maestro-t1.webp',
      'placa-t1.webp',
      'edicion-town_hall.webp',
      'guia-t1.png',
      'identidad-t1.png',
    ]) {
      expect(seCopiaAlBuild(`bases/knight/fuentes/${f}`), f).toBe(false);
    }
  });

  it('copia las letras de los temas con su licencia y deja fuera `art/` entero', () => {
    // Las letras viven en `letras/`: en `fuentes/` el build las dejaría fuera.
    for (const f of [
      'letras/cinzel/Cinzel.ttf',
      'letras/cinzel/OFL.txt',
      'letras/cinzel/procedencia.json',
      'letras/almendra/Almendra-Bold.ttf',
    ]) {
      expect(seCopiaAlBuild(f), f).toBe(true);
    }
    // Las láminas de las que se midieron y las demás referencias de estilo.
    for (const t of FACTION_IDS) {
      expect(seCopiaAlBuild(`art/temas/${t}.png`), t).toBe(false);
      expect(seCopiaAlBuild(`art/${t}/concepto.png`), t).toBe(false);
    }
    expect(seCopiaAlBuild('art/prompts.json')).toBe(false);
  });

  it('copia las piezas finales de los temas y deja fuera sus guías de corte', () => {
    // La página pide `/temas/<tema>/<pieza>.webp` (`piezas-de-tema.css`); las
    // guías solo las lee el taller al encargarlas.
    for (const t of FACTION_IDS) {
      expect(seCopiaAlBuild(`temas/${t}/marco-mapa.webp`), t).toBe(true);
      expect(seCopiaAlBuild(`temas/${t}/sello.procedencia.json`), t).toBe(true);
    }
    for (const f of ['temas/_guias/marco.png', 'temas/_guias/figura.png']) {
      expect(seCopiaAlBuild(f), f).toBe(false);
    }
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
