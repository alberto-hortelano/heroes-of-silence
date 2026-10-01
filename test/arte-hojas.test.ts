/**
 * Las hojas del taller que están en `assets/unidades/`: su JSON es lo que sale
 * de MEDIR la imagen (#120), y cada imagen lleva su procedencia.
 *
 * Volver a derivar y comparar es lo que caza las dos derivas de siempre: un
 * ancla retocada a mano en el JSON y una imagen sustituida sin volver a derivar
 * (el sha256 ya no casa). Y la procedencia es la de los acuerdos de arte: la
 * primera referencia de un atlas es la pose del maniquí y la segunda la
 * identidad; una mención a Y Bot en el prompt no demuestra que se usara.
 */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { derivarAtlas, rutaDelJson } from '../tools/taller/derivar.js';

const RAIZ = join(import.meta.dirname, '..');
const UNIDADES = join(RAIZ, 'assets/unidades');

const hojas = existsSync(UNIDADES)
  ? readdirSync(UNIDADES)
      .filter((d) => !d.startsWith('_'))
      .flatMap((d) => ['atlas.webp', 'identidad.webp'].map((f) => join(UNIDADES, d, f)))
      .filter((f) => existsSync(f))
  : [];

const leer = (r: string): any => JSON.parse(readFileSync(r, 'utf8'));
const sha256 = (r: string): string => createHash('sha256').update(readFileSync(r)).digest('hex');

describe('las hojas del taller', () => {
  it.each(hojas.filter((h) => h.endsWith('atlas.webp')))(
    '%s: el JSON es lo que mide la imagen',
    async (h) => {
      expect(leer(rutaDelJson(h))).toEqual(JSON.parse(JSON.stringify(await derivarAtlas(h))));
    },
  );

  it.each(hojas)('%s: lleva su procedencia', (h) => {
    const p = leer(h.replace(/\.webp$/, '.procedencia.json'));
    expect(p.salida.sha256, 'la imagen cambió sin registrar de dónde sale').toBe(sha256(h));
    expect(p.hilo).toMatch(/^[0-9a-f-]{36}$/);
    expect(p.prompt.length).toBeGreaterThan(100);
    for (const r of p.referencias) expect(r.sha256).toMatch(/^[0-9a-f]{64}$/);
    // Una corrección reabre el hilo de una generación que ya llevaba sus referencias.
    if (p.reanuda === undefined) {
      expect(p.referencias[0]?.papel).toBe('pose');
      if (h.endsWith('atlas.webp')) expect(p.referencias[1]?.papel).toBe('identidad');
    }
  });

  it('cada atlas tiene su lámina de identidad al lado', () => {
    for (const h of hojas.filter((x) => x.endsWith('atlas.webp'))) {
      expect(existsSync(h.replace('atlas.webp', 'identidad.webp')), h).toBe(true);
    }
  });
});
