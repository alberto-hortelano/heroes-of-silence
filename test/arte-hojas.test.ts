/**
 * Las hojas del taller que están en `assets/unidades/`: cada imagen lleva su
 * procedencia. (Las direcciones de 8 —su JSON medido y sus hojas— las mira
 * `taller-8d.test.ts`; el `atlas.webp` de una dirección se retiró el 03-10-2026.)
 *
 * Volver a derivar y comparar es lo que caza las dos derivas de siempre: un
 * ancla retocada a mano en el JSON y una imagen sustituida sin volver a derivar
 * (el sha256 ya no casa). Y la procedencia es la de los acuerdos de arte: la
 * primera referencia de un atlas es la pose del maniquí y la segunda la
 * identidad; una mención a Y Bot en el prompt no demuestra que se usara.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { derivarCeldas } from '../tools/taller/componer-atlas-mapa.js';
import { derivarEfecto, derivarPieza, rutaDelJson } from '../tools/taller/derivar.js';
import { puenteDerivado } from '../tools/taller/paredes-puentes.js';
import { sha256 } from './helpers.js';
import { segunPrisa } from './lento.js';

const RAIZ = join(import.meta.dirname, '..');
const UNIDADES = join(RAIZ, 'assets/unidades');

const hojas = existsSync(UNIDADES)
  ? readdirSync(UNIDADES)
      .filter((d) => !d.startsWith('_'))
      .map((d) => join(UNIDADES, d, 'identidad.webp'))
      .filter((f) => existsSync(f))
  : [];

/** Las piezas sueltas del mapa y las láminas de muestra, con su procedencia. */
const MAPA = join(RAIZ, 'assets/mapa');
const piezas = existsSync(MAPA)
  ? readdirSync(MAPA)
      .filter((f) => f.endsWith('.webp'))
      .map((f) => join(MAPA, f))
  : [];
const muestras = existsSync(join(MAPA, 'muestras'))
  ? readdirSync(join(MAPA, 'muestras'))
      .filter((f) => f.endsWith('.webp'))
      .map((f) => join(MAPA, 'muestras', f))
  : [];

/** Los edificios de ciudad, por facción: se colocan por su base, como las piezas del mapa. */
const EDIFICIOS = join(RAIZ, 'assets/edificios');
const edificios = existsSync(EDIFICIOS)
  ? readdirSync(EDIFICIOS).flatMap((f) =>
      readdirSync(join(EDIFICIOS, f))
        .filter((x) => x.endsWith('.webp'))
        .map((x) => join(EDIFICIOS, f, x)),
    )
  : [];

const leer = (r: string): any => JSON.parse(readFileSync(r, 'utf8'));

describe('las hojas del taller', () => {
  it.each(hojas)('%s: lleva su procedencia', (h) => {
    const p = leer(h.replace(/\.webp$/, '.procedencia.json'));
    expect(p.salida.sha256, 'la imagen cambió sin registrar de dónde sale').toBe(sha256(h));
    expect(p.hilo).toMatch(/^[0-9a-f-]{36}$/);
    expect(p.prompt.length).toBeGreaterThan(100);
    for (const r of p.referencias) expect(r.sha256).toMatch(/^[0-9a-f]{64}$/);
    // Una corrección reabre el hilo de una generación que ya llevaba sus referencias.
    if (p.reanuda === undefined) {
      expect(p.referencias[0]?.papel).toBe('pose');
    }
  });
});

/** Un puente se ancla en el centro del tablero, no en la base (§17). */
const esPuente = (p: string): boolean => /\/puente-[^/]+\.webp$/.test(p);

/**
 * Las que se vuelven a derivar en `pnpm verify`: la primera pieza suelta, el
 * primer puente y el primer edificio, que son las tres cuentas distintas (#167).
 * Derivarlas todas eran ~100 imágenes y 10 s con la máquina cargada; eso queda
 * en `pnpm verify:lento`. El sha256 del JSON, que caza la imagen sustituida sin
 * volver a derivar, lo miran todas en las dos.
 */
const derivadas = new Set(
  segunPrisa(
    [piezas.find((p) => !esPuente(p)), piezas.find(esPuente), edificios[0]].filter(
      (p) => p !== undefined,
    ),
    [...piezas, ...edificios],
  ),
);

describe('las piezas del mapa', () => {
  it('el bucle rápido deriva una de cada cuenta: pieza suelta, puente y edificio', () => {
    expect(derivadas.size).toBe(segunPrisa(3, piezas.length + edificios.length));
  });

  it.each([...piezas, ...edificios])('%s: el JSON es lo que mide la imagen', async (p) => {
    const json = leer(rutaDelJson(p));
    expect(json.sha256, 'la imagen cambió sin volver a derivar su JSON').toBe(sha256(p));
    if (!derivadas.has(p)) return;
    const esperado = esPuente(p) ? await puenteDerivado(p) : await derivarPieza(p);
    expect(json).toEqual(JSON.parse(JSON.stringify(esperado)));
  });

  it.each([...piezas, ...muestras, ...edificios])('%s: lleva su procedencia', (p) => {
    const pr = leer(p.replace(/\.webp$/, '.procedencia.json'));
    expect(pr.salida.sha256, 'la imagen cambió sin registrar de dónde sale').toBe(sha256(p));
    expect(pr.hilo).toMatch(/^[0-9a-f-]{36}$/);
    for (const r of pr.referencias) expect(r.sha256).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('los ids de las hojas son los del catálogo', () => {
  it('la tabla de docs/art/unidades.md y las carpetas de assets/unidades dicen lo mismo', () => {
    // El catálogo de la fase 4 usará estos ids tal cual: renombrar una carpeta
    // sin el documento, o al revés, rompería el enganche en silencio.
    const doc = readFileSync(join(RAIZ, 'docs/art/unidades.md'), 'utf8');
    const enDoc = new Set([...doc.matchAll(/^\| `([a-z0-9-]+)` \|/gm)].map((m) => m[1]));
    const enDisco = new Set(
      existsSync(UNIDADES) ? readdirSync(UNIDADES).filter((d) => !d.startsWith('_')) : [],
    );
    expect([...enDisco].sort()).toEqual([...enDoc].sort());
  });
});

describe('el atlas del mapa', () => {
  const json = join(RAIZ, 'assets/rpg/map-atlas.json');
  it.runIf(existsSync(json))('su JSON es lo que mide la imagen, celda a celda', async () => {
    const png = readFileSync(join(RAIZ, 'assets/rpg/map-atlas.png'));
    const d = leer(json);
    expect(d.sha256, 'el atlas cambió sin volver a componerlo').toBe(
      sha256(join(RAIZ, 'assets/rpg/map-atlas.png')),
    );
    expect(d.celdas).toEqual(JSON.parse(JSON.stringify(await derivarCeldas(png))));
    // Cada celda sale de una pieza con su procedencia, o de una pieza del mapa ya aprobada.
    for (const f of d.fuentes) {
      expect(sha256(join(RAIZ, f.fuente)), f.fuente).toBe(f.sha256);
      expect(
        existsSync(join(RAIZ, f.fuente.replace(/\.webp$/, '.procedencia.json'))),
        f.fuente,
      ).toBe(true);
    }
  });
});

describe('los efectos de batalla', () => {
  const EF = join(RAIZ, 'assets/efectos');
  const de = (dir: string): string[] =>
    existsSync(dir)
      ? readdirSync(dir)
          .filter((f) => f.endsWith('.webp'))
          .map((f) => join(dir, f))
      : [];
  const animados = de(join(EF, 'animados'));
  const quietos = de(EF);

  it.each(animados)('%s: el JSON es lo que mide la tira', async (p) => {
    expect(leer(rutaDelJson(p))).toEqual(JSON.parse(JSON.stringify(await derivarEfecto(p))));
  });

  it.each([...animados, ...quietos])('%s: lleva su procedencia', (p) => {
    const pr = leer(p.replace(/\.webp$/, '.procedencia.json'));
    expect(pr.salida.sha256, 'la imagen cambió sin registrar de dónde sale').toBe(sha256(p));
    expect(pr.hilo).toMatch(/^[0-9a-f-]{36}$/);
  });

  // Cada lámina de iconos apunta el sha256 de los ficheros que salieron de ella.
  for (const indice of [
    join(EF, 'iconos/iconos.json'),
    join(RAIZ, 'assets/iconos/recursos/recursos.json'),
  ]) {
    it.runIf(existsSync(indice))(`${indice}: cada icono es el que apuntó su lámina`, () => {
      const dir = join(indice, '..');
      const d = leer(indice);
      for (const ic of d.iconos) expect(sha256(join(dir, ic.imagen)), ic.nombre).toBe(ic.sha256);
      const lamina = join(dir, d.lamina);
      expect(leer(lamina.replace(/\.webp$/, '.procedencia.json')).salida.sha256).toBe(
        sha256(lamina),
      );
    });
  }
});
