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
import { derivarPieza, rutaDelJson } from '../tools/taller/derivar.js';
import { puestoDerivado } from '../tools/taller/mapa.js';
import { muroDerivado } from '../tools/taller/muros.js';
import { puenteDerivado } from '../tools/taller/paredes-puentes.js';
import { sha256 } from './comun.js';
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

/**
 * La plaza de la base caminable (vuelta 3): las placas de cada tramo
 * (`fuentes/placa-t<n>.webp`) y los cuadros de los que se recortan
 * (`fuentes/maestro-t<n>.webp`, `fuentes/edicion-<id>.webp`) son de Codex y
 * llevan su procedencia, sin JSON derivado: son opacos. Lo que pinta el juego
 * (`tramo-<n>.webp`, `suelo.webp` y el recorte de cada edificio) no sale de
 * Codex sino del recorte, y su sha256 lo mira `base-arte.test.ts` volviéndolo
 * a derivar.
 */
const BASES = join(RAIZ, 'assets/bases');
const cuadrosDeLaBase = existsSync(BASES)
  ? readdirSync(BASES).flatMap((f) => [
      ...(existsSync(join(BASES, f, 'fuentes'))
        ? readdirSync(join(BASES, f, 'fuentes'))
            .filter((x) => /^(maestro-t\d+|placa-t\d+|edicion-[a-z0-9_]+)\.webp$/.test(x))
            .map((x) => join(BASES, f, 'fuentes', x))
        : []),
    ])
  : [];
muestras.push(...cuadrosDeLaBase);

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

/** Un tramo de norte a sur lleva además el paso de su tirada (§29, `muros.ts`). */
const esMuroNorteSur = (p: string): boolean => /\/muro-ns-\d+\.webp$/.test(p);

/** Una obra del puesto lleva además su casilla, registrada sobre su guía (`mapa.ts`). */
const esPuesto = (p: string): boolean => /\/puesto-[^/]+\.webp$/.test(p);

/**
 * Las que se vuelven a derivar en `pnpm verify`: la primera pieza suelta, el
 * primer puente, el primer tramo de norte a sur y la primera obra del puesto, que
 * son las cuatro cuentas distintas (#167; el edificio, la quinta, se retiró con
 * los edificios del 02-10 el 06-11-2026). Derivarlas todas eran ~100 imágenes y
 * 10 s con la máquina cargada; eso queda en `pnpm verify:lento`. El sha256 del
 * JSON, que caza la imagen sustituida sin volver a derivar, lo miran todas en
 * las dos.
 */
const derivadas = new Set(
  segunPrisa(
    [
      piezas.find((p) => !esPuente(p) && !esMuroNorteSur(p) && !esPuesto(p)),
      piezas.find(esPuente),
      piezas.find(esMuroNorteSur),
      piezas.find(esPuesto),
    ].filter((p) => p !== undefined),
    piezas,
  ),
);

describe('las piezas del mapa', () => {
  it('el bucle rápido deriva una de cada cuenta: pieza suelta, puente, tramo de norte a sur y obra del puesto', () => {
    expect(derivadas.size).toBe(segunPrisa(4, piezas.length));
  });

  it.each(piezas)('%s: el JSON es lo que mide la imagen', async (p) => {
    const json = leer(rutaDelJson(p));
    expect(json.sha256, 'la imagen cambió sin volver a derivar su JSON').toBe(sha256(p));
    if (!derivadas.has(p)) return;
    const esperado = esPuente(p)
      ? await puenteDerivado(p)
      : esMuroNorteSur(p)
        ? await muroDerivado(p)
        : esPuesto(p)
          ? await puestoDerivado(p)
          : await derivarPieza(p);
    expect(json).toEqual(JSON.parse(JSON.stringify(esperado)));
  });

  it.each([...piezas, ...muestras])('%s: lleva su procedencia', (p) => {
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
