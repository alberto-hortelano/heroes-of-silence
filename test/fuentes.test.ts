/**
 * Las letras de título de los temas (13-10-2026): `fuentes.css` sale de la tabla
 * de `tools/fuentes/bajar.ts`, cada fichero de la tabla está en `assets/letras/`
 * sin tocar (su sha256 es el que se revisó al bajarlo), con su `OFL.txt` y su
 * procedencia al lado, y no bloquea el primer pintado (`swap`). Y ninguna hoja
 * del cliente pide nada fuera de su origen: ni un CDN ni una ruta de esta máquina.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FACTION_IDS } from '@core/types.js';
import { describe, expect, it } from 'vitest';
import {
  CARPETA_DE_LETRAS,
  COMMIT,
  cssDeLetras,
  FUENTES,
  HOJA_DE_LETRAS,
} from '../tools/fuentes/bajar.js';
import { sha256 } from './helpers.js';
import {
  bloquesCss,
  hojasDelCliente,
  leerHoja,
  resuelta,
  sinComentariosCss,
  temas,
} from './hojas-de-estilo.js';

const RAIZ = join(import.meta.dirname, '..');
const ASSETS = join(RAIZ, 'assets');

describe('las letras de los temas', () => {
  it('la hoja de los @font-face es la que sale de la tabla', () => {
    // Roto a mano: un `font-display: block` escrito en `fuentes.css` sale rojo.
    expect(readFileSync(join(RAIZ, HOJA_DE_LETRAS), 'utf8')).toBe(cssDeLetras());
  });

  it('cada fichero de la tabla está en assets/letras/, sin tocar, con su OFL y su procedencia', () => {
    for (const fuente of FUENTES) {
      const carpeta = join(CARPETA_DE_LETRAS, fuente.carpeta);
      const procedencia = JSON.parse(readFileSync(join(carpeta, 'procedencia.json'), 'utf8')) as {
        commit: string;
        ficheros: { local: string; sha256: string }[];
      };
      expect(procedencia.commit).toBe(COMMIT);
      for (const fichero of [...fuente.ficheros, fuente.licencia]) {
        const ruta = join(carpeta, fichero.local);
        expect(sha256(ruta), ruta).toBe(fichero.sha256);
        expect(procedencia.ficheros.find((x) => x.local === fichero.local)?.sha256, ruta).toBe(
          fichero.sha256,
        );
      }
      for (const { local } of fuente.ficheros) {
        // La firma de un sfnt TrueType: 0x00010000 (o «true», la de Apple).
        const firma = readFileSync(join(carpeta, local)).subarray(0, 4).toString('hex');
        expect(['00010000', '74727565'], local).toContain(firma);
      }
    }
  });

  it('en assets/letras/ no hay más que lo que se bajó', () => {
    const esperados = FUENTES.flatMap((f) =>
      [...f.ficheros.map((x) => x.local), 'OFL.txt', 'procedencia.json'].map(
        (n) => `${f.carpeta}/${n}`,
      ),
    ).sort();
    const hay = readdirSync(CARPETA_DE_LETRAS, { recursive: true, withFileTypes: true })
      .filter((e) => e.isFile())
      .map((e) => join(e.parentPath, e.name).slice(CARPETA_DE_LETRAS.length + 1))
      .sort();
    expect(hay).toEqual(esperados);
  });

  it('ninguna bloquea el primer pintado, y la que no sirve para cifras no las cubre', () => {
    // «Día 1» no se lee «Día ı» ni «Día I»: las cifras salen de la letra de
    // respaldo del tema, que ya vigila `temas.test.ts`. Roto a mano: sin el
    // `unicode-range` de Almendra en el generador sale rojo.
    const cubreCifras = (rango: string | undefined): boolean =>
      rango === undefined ||
      rango.split(',').some((tramo) => {
        const [desde, hasta = desde] = tramo.trim().replace(/^U\+/i, '').split('-');
        const [a, b] = [Number.parseInt(desde as string, 16), Number.parseInt(hasta as string, 16)];
        return a <= 0x39 && b >= 0x30;
      });
    const caras = bloquesCss(cssDeLetras()).filter((b) => b.selector === '@font-face');
    expect(caras.length).toBe(FUENTES.reduce((n, f) => n + f.ficheros.length, 0));
    for (const { declaraciones } of caras) {
      const de = new Map(declaraciones.map((d) => [d.propiedad, d.valor]));
      const familia = de.get('font-family')?.replace(/^'|'$/g, '');
      const fuente = FUENTES.find((f) => f.familia === familia);
      expect(de.get('font-display'), familia).toBe('swap');
      expect(cubreCifras(de.get('unicode-range')), familia).toBe(!fuente?.sinCifras);
    }
    expect(FUENTES.filter((f) => f.sinCifras).length).toBeGreaterThan(0);
  });

  it('cada tema titula con la suya: la primera familia de su --letra-titulo', () => {
    const { bloques } = temas();
    for (const tema of FACTION_IDS) {
      const fuente = FUENTES.find((f) => f.tema === tema);
      if (fuente === undefined) throw new Error(`el tema ${tema} no tiene letra en FUENTES`);
      const titulo = resuelta(bloques.get(tema) as Map<string, string>, '--letra-titulo');
      expect(
        titulo
          .split(',')[0]
          ?.trim()
          .replace(/^['"]|['"]$/g, ''),
        tema,
      ).toBe(fuente.familia);
    }
  });

  it('ninguna hoja del cliente pide nada fuera de su origen ni de esta máquina', () => {
    // Un `url()` es de la carpeta pública (`/…`, servido por vite y copiado al
    // build) y está en `assets/`, o un `data:`; nada de `http`, `//` ni rutas del
    // disco. Roto a mano: un `url('https://fonts.gstatic.com/…')` en una hoja sale
    // rojo, y uno a una letra que no está, también.
    const mal: string[] = [];
    for (const ruta of hojasDelCliente()) {
      const css = sinComentariosCss(leerHoja(ruta.replace(/^src\/client\//, '')));
      for (const m of css.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)) {
        const url = m[1] as string;
        if (url.startsWith('data:')) continue;
        if (!url.startsWith('/') || url.startsWith('//'))
          mal.push(`${ruta}: ${url} no es de la carpeta pública`);
        else if (!existsSync(join(ASSETS, url))) mal.push(`${ruta}: ${url} no está en assets/`);
      }
    }
    expect(mal).toEqual([]);
  });
});
