/**
 * El arte de la base como un solo cuadro (`assets/bases/<f>/`, vuelta 3): que el
 * índice que lee el cliente sea el que deriva el recorte de lo que hay en la
 * carpeta, que cada recorte caiga dentro de la región de su sitio y sobre un
 * tramo con placa, que los encargos vayan en su cadena (cada tramo sobre su
 * guía, con la junta; cada placa y cada mejora editando su cuadro) y que el
 * taller describa exactamente los edificios del catálogo.
 *
 * Volver a recortar y comparar el sha256 de los píxeles es lo que caza un
 * recorte retocado a mano o una fuente sustituida sin recortar otra vez: un
 * tramo y un recorte en `pnpm verify`, todos y el suelo en `pnpm verify:lento`.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { ALFA_QUE_TOCA } from '../src/client/render/base/golpe.js';
import { sitioDe, sitioDeEdificio, sitiosDeLaBase } from '../src/core/town/sitios.js';
import { FACTION_IDS } from '../src/core/types.js';
import { disposicionDe, type IndiceDeLaBase, SOLAPE, TRAMO } from '../src/shared/base.js';
import {
  ARTE_DE_LA_BASE,
  abiertaPintada,
  cuadroDe,
  dirDeLaBase,
  edificiosConArte,
  encargoDeEdicion,
  encargoDeLaAbierta,
  encargoDeLaPlaca,
  encargoDelMaestro,
  encargoDelRetoque,
  encargosDeLaBase,
  guiaDelTramo,
  JUNTA,
  maestroDelTramo,
  mejorasDe,
  moradasDeLaBase,
  placaDelTramo,
  retoqueDe,
  salaPintada,
  sitiosPintados,
} from '../tools/taller/base.js';
import { encargoSchema } from '../tools/taller/encargo.js';
import {
  derivarRecorte,
  derivarSuelo,
  derivarTramo,
  FUNDIDO_DEL_PIE,
  placasDeLaBase,
  tramoDelSuelo,
} from '../tools/taller/recorte-base.js';
import { sha256 } from './helpers.js';
import { itLento, segunPrisa } from './lento.js';

const RAIZ = join(import.meta.dirname, '..');
const FACCIONES = FACTION_IDS;

/** El índice escrito de una facción, leído una vez. */
const INDICES = new Map<string, IndiceDeLaBase>();
const indiceDe = (f: (typeof FACCIONES)[number]): IndiceDeLaBase => {
  let i = INDICES.get(f);
  if (i === undefined) {
    i = JSON.parse(
      readFileSync(join(RAIZ, dirDeLaBase(f), 'indice.json'), 'utf8'),
    ) as IndiceDeLaBase;
    INDICES.set(f, i);
  }
  return i;
};

describe('el arte de la base', () => {
  it('cada facción lleva su índice, con las placas que hay en la carpeta', () => {
    for (const f of FACCIONES) {
      const ruta = join(RAIZ, dirDeLaBase(f), 'indice.json');
      expect(existsSync(ruta), `${f}: falta ${ruta} (pnpm taller recortar-base ${f})`).toBe(true);
      expect(
        indiceDe(f).tramos.map((t) => t !== null),
        f,
      ).toEqual(placasDeLaBase(f));
      expect(indiceDe(f).tramos, f).toHaveLength(disposicionDe(f).tramos);
      for (const t of indiceDe(f).tramos)
        if (t !== null)
          expect(sha256(join(RAIZ, dirDeLaBase(f), t.imagen)), `${f}/${t.imagen}`).toBe(t.sha256);
      // Con alguna placa hay suelo y cielo; sin ninguna, no.
      expect(indiceDe(f).suelo !== null, f).toBe(placasDeLaBase(f).some(Boolean));
      expect(indiceDe(f).cielo !== null, f).toBe(placasDeLaBase(f).some(Boolean));
    }
  });

  it('cada recorte es el que se escribió, cae dentro de la región de su sitio y sobre un tramo con placa', () => {
    for (const f of FACCIONES) {
      const d = disposicionDe(f);
      const indice = indiceDe(f);
      for (const [id, e] of Object.entries(indice.edificios)) {
        const sitio = d.sitios[sitioDeEdificio(f, id).id];
        expect(e.tramo, `${f}/${id}`).toBe(sitio.tramo);
        expect(indice.tramos[e.tramo - 1], `${f}/${id}: su tramo no tiene placa`).not.toBeNull();
        expect(
          sha256(join(RAIZ, dirDeLaBase(f), e.imagen)),
          `${f}/${id}: la imagen cambió sin recortar`,
        ).toBe(e.sha256);
        expect(e.en[0], `${f}/${id}`).toBeGreaterThanOrEqual(sitio.region.x0);
        expect(e.en[0] + e.ancho, `${f}/${id}`).toBeLessThanOrEqual(sitio.region.x1);
        expect(e.en[1] + e.alto, `${f}/${id}`).toBeLessThanOrEqual(sitio.region.pie);
      }
    }
  });

  it('las cinco facciones llevan su arte entero: cada tramo con placa, cada edificio con su recorte y cada morada abierta (20-10-2026)', () => {
    for (const f of FACCIONES) {
      const indice = indiceDe(f);
      expect(
        indice.tramos.every((t) => t !== null),
        `${f}: un tramo sin placa`,
      ).toBe(true);
      expect(indice.suelo, f).not.toBeNull();
      expect(Object.keys(indice.edificios).sort(), f).toEqual([...edificiosConArte(f)].sort());
      expect(Object.keys(indice.abiertas).sort(), f).toEqual([...moradasDeLaBase(f)].sort());
    }
  });

  it('cada puerta tiene su edificio bajo el punto donde se pulsa (`dondePulsarElSitio`: medio paso sobre el umbral)', async () => {
    // El ayuntamiento de los no muertos tenía un agujero bajo el arco de la puerta
    // y el clic caía al suelo: el héroe llegaba y no se abría «Ampliar» (20-10-2026).
    for (const f of FACCIONES) {
      const d = disposicionDe(f);
      const indice = indiceDe(f);
      for (const s of sitiosDeLaBase(f)) {
        const id = s.cadena[0];
        const e = id === undefined ? undefined : indice.edificios[id];
        if (e === undefined) continue;
        const [px, fila] = d.sitios[s.id].umbral.enElCuadro;
        const x = px - e.en[0];
        const y = Math.round(fila - 0.5 * TRAMO.pxPorPaso) - e.en[1];
        const { data, info } = await sharp(join(RAIZ, dirDeLaBase(f), e.imagen))
          .ensureAlpha()
          .extractChannel(3)
          .raw()
          .toBuffer({ resolveWithObject: true });
        expect(data[y * info.width + x] ?? 0, `${f}/${id}`).toBeGreaterThanOrEqual(ALFA_QUE_TOCA);
      }
    }
  });

  it('cada versión abierta del índice es la que se escribió, de una morada de su base, de su fuente y en el sitio de su exterior', () => {
    for (const f of FACCIONES) {
      const d = disposicionDe(f);
      const indice = indiceDe(f);
      expect(indice.abiertas, `${f}: el índice no dice qué versiones abiertas hay`).toBeDefined();
      const moradas = moradasDeLaBase(f);
      for (const [id, e] of Object.entries(indice.abiertas)) {
        expect(moradas, `${f}/${id} no es una morada de su base`).toContain(id);
        expect(e.imagen, `${f}/${id}`).toBe(`abierta-${id}.webp`);
        expect(
          sha256(join(RAIZ, dirDeLaBase(f), e.imagen)),
          `${f}/${id}: la versión abierta cambió sin recortarla`,
        ).toBe(e.sha256);
        expect(existsSync(join(RAIZ, `${abiertaPintada(f, id)}.webp`)), `${f}/${id}`).toBe(true);
        // Dentro de la región de su sitio y con el pie donde el de su exterior
        // (un Codex que la mueve o la encoge se ve aquí).
        const sitio = d.sitios[sitioDeEdificio(f, id).id];
        expect(e.tramo, `${f}/${id}`).toBe(sitio.tramo);
        expect(e.en[0], `${f}/${id}`).toBeGreaterThanOrEqual(sitio.region.x0);
        expect(e.en[0] + e.ancho, `${f}/${id}`).toBeLessThanOrEqual(sitio.region.x1);
        expect(e.en[1] + e.alto, `${f}/${id}`).toBeLessThanOrEqual(sitio.region.pie);
        const fuera = indice.edificios[id];
        expect(fuera, `${f}/${id}: abierta sin exterior`).toBeDefined();
        expect(
          Math.abs(e.en[1] + e.alto - (fuera!.en[1] + fuera!.alto)),
          `${f}/${id}: el pie de la versión abierta se aparta del de su exterior`,
        ).toBeLessThanOrEqual(24);
      }
    }
  });

  it('los templarios heredan el arte de los caballeros: cada edificio suyo lleva su recorte', () => {
    // Decisión del usuario (18-10-2026): la base templaria es la del caballero.
    // Sus moradas van en los sitios donde el caballero pintó algo que les cuadra
    // (`data/buildings.json`); un sitio de morada sin edificio no deja recorte.
    const edificios = Object.keys(indiceDe('templarios').edificios).sort();
    expect(edificios).toEqual(
      sitiosDeLaBase('templarios')
        .flatMap((s) => s.cadena)
        .sort(),
    );
    expect(edificios).toEqual(
      expect.arrayContaining([
        'templarios_pueblo',
        'templarios_forja',
        'templarios_establos',
        'templarios_monasterio',
      ]),
    );
  });

  it('los encargos: 5 maestros sobre su guía, 5 placas y 3 mejoras, cada una sobre lo de antes', () => {
    const d = disposicionDe('templarios');
    const maestros = Array.from({ length: d.tramos }, (_, i) =>
      encargoDelMaestro('templarios', i + 1),
    );
    const placas = Array.from({ length: d.tramos }, (_, i) =>
      encargoDeLaPlaca('templarios', i + 1),
    );
    const mejoras = [...mejorasDe('templarios')].map((m) => encargoDeEdicion('templarios', m.id));
    expect([maestros.length, placas.length, mejoras.length]).toEqual([5, 5, 3]);
    for (const [i, m] of maestros.entries()) {
      const n = i + 1;
      // Cada uno sobre su guía, sin el de al lado: la costura la esconde la
      // junta, que el prompt pide en los bordes que dan a otro tramo (con la
      // placa de al lado como referencia o con su final en el lienzo, Codex
      // pintó la plaza a otra altura, F2).
      expect(
        m.referencias.map((r) => r.papel),
        `maestro-t${n}`,
      ).toEqual(['estilo', 'estilo', 'plaza', 'edificios']);
      expect(m.referencias[2]?.ruta).toBe(guiaDelTramo('templarios', n));
      const bordes =
        n === 1 ? 'el borde derecho' : n === d.tramos ? 'el borde izquierdo' : 'los dos bordes';
      expect(m.descripcion, `maestro-t${n}`).toContain(`LA JUNTA, en ${bordes}`);
      expect(m.descripcion).toContain(`las ${JUNTA.ancho} columnas`);
      expect(m.salida).toBe(maestroDelTramo('templarios', n));
    }
    // Todo cuadro de la base mide un tramo y, al llegar, se vuelve a recortar:
    // lo declara el encargo, no lo adivina el trabajador por la ruta.
    for (const e of [...maestros, ...placas, ...mejoras]) {
      expect(e.fondo, e.id).toBe('opaco');
      expect(e.tamano, e.id).toEqual({ ancho: 1536, alto: 1024 });
      expect(e.despues, e.id).toEqual({ orden: 'recortar-base', faccion: 'templarios' });
    }
    for (const [i, p] of placas.entries()) {
      expect(p.referencias).toEqual([
        { ruta: `${maestroDelTramo('templarios', i + 1)}.webp`, papel: 'edita' },
      ]);
      expect(p.salida).toBe(placaDelTramo('templarios', i + 1));
      expect(p.salida, 'la placa de Codex solo la lee el taller').toMatch(/\/fuentes\//);
    }
    for (const [i, { id, antes }] of [...mejorasDe('templarios')].entries()) {
      const e = mejoras[i]!;
      expect(e.salida, id).toMatch(new RegExp(`/edicion-${id}$`));
      expect(e.referencias[0], id).toEqual({
        ruta: `${cuadroDe('templarios', antes)}.webp`,
        papel: 'edita',
      });
      expect(e.referencias[1]?.papel, id).toBe('edificios');
    }
    // La cadena de las mejoras: city_hall edita town_hall, que edita el maestro.
    expect(cuadroDe('templarios', 'village_hall')).toBe(
      maestroDelTramo('templarios', d.sitios.hall.tramo),
    );
    expect(encargoDeEdicion('templarios', 'city_hall').referencias[0]?.ruta).toBe(
      `${cuadroDe('templarios', 'town_hall')}.webp`,
    );
  });

  it('el retoque del pueblo edita la placa, de frente, y manda en su cuadro solo si está en disco (C15)', () => {
    const d = disposicionDe('templarios');
    const id = 'templarios_pueblo';
    const r = encargoDelRetoque('templarios', id);
    expect(() => encargoSchema.parse(r)).not.toThrow();
    const { tramo, umbral, region } = d.sitios[sitioDeEdificio('templarios', id).id];
    // Sobre la placa: alrededor queda lo que pinta el juego, sin el halo del maestro.
    expect(r.referencias).toEqual([
      { ruta: `${placaDelTramo('templarios', tramo)}.webp`, papel: 'edita' },
      { ruta: `assets/bases/templarios/fuentes/identidad-retoque-${id}.png`, papel: 'edificios' },
    ]);
    expect(r.salida).toBe(retoqueDe('templarios', id));
    expect(r.salida).toMatch(/\/fuentes\//);
    expect(r.despues).toEqual({ orden: 'recortar-base', faccion: 'templarios' });
    for (const texto of [
      'DE FRENTE',
      'FACHADA PARALELA',
      'SIN HALO',
      `columna ${umbral.enElCuadro[0]} y la fila ${umbral.enElCuadro[1]}`,
      `columnas ${region.x0} y ${region.x1}`,
    ])
      expect(r.descripcion, texto).toContain(texto);
    // Un hecho, un sitio: el cuadro del pueblo es el retoque si y solo si está.
    const hay = existsSync(join(RAIZ, `${retoqueDe('templarios', id)}.webp`));
    expect(cuadroDe('templarios', id)).toBe(
      hay ? retoqueDe('templarios', id) : maestroDelTramo('templarios', tramo),
    );
    expect(Object.keys(ARTE_DE_LA_BASE.templarios.retoques)).toEqual([id]);
    expect(() => encargoDelRetoque('templarios', 'templarios_forja')).toThrow(/no tiene retoque/);
  });

  it('la versión abierta de cada morada edita su cuadro con su sala de referencia; la del pueblo espera al retoque (C14)', () => {
    const d = disposicionDe('templarios');
    const moradas = moradasDeLaBase('templarios');
    expect([...moradas].sort()).toEqual(Object.keys(ARTE_DE_LA_BASE.templarios.salas).sort());
    for (const id of moradas) {
      const e = encargoDeLaAbierta('templarios', id);
      expect(() => encargoSchema.parse(e), id).not.toThrow();
      expect(e.referencias, id).toEqual([
        { ruta: `${cuadroDe('templarios', id)}.webp`, papel: 'edita' },
        { ruta: salaPintada('templarios', id), papel: 'interior' },
      ]);
      expect(existsSync(join(RAIZ, salaPintada('templarios', id))), id).toBe(true);
      expect(e.salida).toBe(abiertaPintada('templarios', id));
      expect(e.despues).toEqual({ orden: 'recortar-base', faccion: 'templarios' });
      const { region } = d.sitios[sitioDeEdificio('templarios', id).id];
      expect(e.descripcion, id).toContain(`columnas ${region.x0} y ${region.x1}`);
      expect(e.descripcion, id).toContain('CASA DE MUÑECAS');
      expect(e.descripcion, id).toContain(ARTE_DE_LA_BASE.templarios.salas[id]!);
    }
    const { listos, esperan } = encargosDeLaBase('templarios');
    const ids = listos.map((e) => e.id);
    const retoque = existsSync(join(RAIZ, `${retoqueDe('templarios', 'templarios_pueblo')}.webp`));
    expect(ids).toContain('base-templarios-retoque-templarios-pueblo');
    for (const id of ['forja', 'establos', 'monasterio'])
      expect(ids).toContain(`base-templarios-abierta-templarios-${id}`);
    expect(ids.includes('base-templarios-abierta-templarios-pueblo')).toBe(retoque);
    expect(esperan.some((e) => e.startsWith('abierta-templarios-pueblo (espera a retoque-'))).toBe(
      !retoque,
    );
    // Sin sala pintada de la vuelta 1 (las otras cuatro), solo su cuadro.
    expect(encargoDeLaAbierta('orkos', 'orkos_pueblo').referencias).toEqual([
      { ruta: `${cuadroDe('orkos', 'orkos_pueblo')}.webp`, papel: 'edita' },
    ]);
  });

  it('el taller describe de cada facción sus edificios, sus mejoras y sus salas, ni uno más', () => {
    for (const f of FACTION_IDS) {
      const arte = ARTE_DE_LA_BASE[f];
      const primeros = sitiosDeLaBase(f).flatMap((s) => s.cadena.slice(0, 1));
      expect(Object.keys(arte.edificios).sort(), f).toEqual([...primeros].sort());
      expect(Object.keys(arte.mejoras).sort(), f).toEqual(
        [...mejorasDe(f)].map((m) => m.id).sort(),
      );
      expect(Object.keys(arte.salas).sort(), f).toEqual([...moradasDeLaBase(f)].sort());
    }
  });

  it('sin hoja de identidad, el maestro lleva cada edificio descrito y ningún edificio sale de un tramo vacío', () => {
    for (const f of FACTION_IDS.filter((x) => !ARTE_DE_LA_BASE[x].conIdentidad)) {
      const d = disposicionDe(f);
      for (let n = 1; n <= d.tramos; n++) {
        const m = encargoDelMaestro(f, n);
        expect(() => encargoSchema.parse(m), `${f} T${n}`).not.toThrow();
        expect(
          m.referencias.map((r) => r.papel),
          `${f} T${n}`,
        ).toEqual(['estilo', 'estilo', 'plaza']);
        for (const s of sitiosPintados(f, d, n))
          expect(m.descripcion, `${f} T${n}`).toContain(
            ARTE_DE_LA_BASE[f].edificios[sitioDe(f, s).cadena[0]!]!,
          );
        expect(m.descripcion, `${f} T${n}`).toContain(ARTE_DE_LA_BASE[f].heraldica);
      }
    }
  });

  /**
   * Lo que se vuelve a derivar de los tramos: el segundo en el bucle rápido (el
   * primero con solape), todos en el lento. Sin placas no mira nada, y lo dice.
   */
  const conPlaca = placasDeLaBase('templarios').flatMap((hay, i) => (hay ? [i + 1] : []));
  const tramosADerivar = segunPrisa(conPlaca.includes(2) ? [2] : conPlaca.slice(0, 1), conPlaca);
  it.each(tramosADerivar.length > 0 ? tramosADerivar : [0])(
    'tramo %i: lo que pinta el juego es su placa por encima del pie',
    async (n) => {
      if (n === 0) return;
      const e = indiceDe('templarios').tramos[n - 1]!;
      const t = await derivarTramo('templarios', n);
      expect({ ancho: t.ancho, alto: t.alto }).toEqual({ ancho: e.ancho, alto: e.alto });
      expect(
        createHash('sha256').update(t.rgba).digest('hex'),
        'el tramo no es el de su placa: pnpm taller recortar-base templarios',
      ).toBe(e.origen);
      // Por encima del pie, opaco; por debajo del fundido, nada.
      for (let x = n > 1 ? SOLAPE : 0; x < t.ancho; x += 97) {
        const p = t.pie[x]!;
        expect(t.rgba[((p - 2) * t.ancho + x) * 4 + 3], `columna ${x}`).toBe(255);
        if (p + FUNDIDO_DEL_PIE < t.alto)
          expect(t.rgba[((p + FUNDIDO_DEL_PIE) * t.ancho + x) * 4 + 3], `columna ${x}`).toBe(0);
      }
      // Desde el segundo, el solape va fundido de transparente a opaco (lo
      // hornea el taller: el cliente ya no hace un lienzo por tramo).
      if (n > 1) {
        const alfa = (x: number) => t.rgba[(10 * t.ancho + x) * 4 + 3]!;
        expect(alfa(0)).toBeLessThan(10);
        expect(alfa(SOLAPE / 2)).toBeGreaterThan(110);
        expect(alfa(SOLAPE / 2)).toBeLessThan(145);
        expect(alfa(SOLAPE)).toBe(255);
      }
    },
  );

  itLento('el suelo es el que sale de su placa, repetible', async () => {
    const s = indiceDe('templarios').suelo;
    if (s === null) return;
    expect(s.tramo).toBe(await tramoDelSuelo('templarios'));
    const r = await derivarSuelo('templarios', s.tramo);
    expect({ ancho: r.ancho, alto: r.alto }).toEqual({ ancho: s.ancho, alto: s.alto });
    expect(createHash('sha256').update(r.v).digest('hex')).toBe(s.origen);
  });

  /**
   * Lo que se vuelve a recortar: el primero en el bucle rápido (el ayuntamiento
   * si está), todos en el lento. Hasta que haya recortes no mira nada, y lo dice.
   */
  const recortes = Object.keys(indiceDe('templarios').edificios);
  const aDerivar = segunPrisa(
    recortes.includes('village_hall') ? ['village_hall'] : recortes.slice(0, 1),
    recortes,
  );
  it.each(aDerivar.length > 0 ? aDerivar : ['(sin recortes aún)'])(
    '%s: el recorte es el que sale de su cuadro y su placa',
    async (id) => {
      if (recortes.length === 0) return;
      const e = indiceDe('templarios').edificios[id]!;
      const r = await derivarRecorte('templarios', id);
      expect({ tramo: r.tramo, en: r.en, ancho: r.ancho, alto: r.alto }).toEqual({
        tramo: e.tramo,
        en: e.en,
        ancho: e.ancho,
        alto: e.alto,
      });
      expect(
        createHash('sha256').update(r.rgba).digest('hex'),
        'el recorte no es el de sus fuentes: pnpm taller recortar-base templarios',
      ).toBe(e.origen);
    },
  );

  /** Las versiones abiertas, recortadas otra vez: la primera en el bucle rápido, todas en el lento. */
  const abiertas = Object.keys(indiceDe('templarios').abiertas);
  const abiertasADerivar = segunPrisa(abiertas.slice(0, 1), abiertas);
  it.each(abiertasADerivar.length > 0 ? abiertasADerivar : ['(sin versiones abiertas aún)'])(
    '%s: la versión abierta es la que sale de su fuente y su placa',
    async (id) => {
      if (abiertas.length === 0) return;
      const e = indiceDe('templarios').abiertas[id]!;
      const r = await derivarRecorte('templarios', id, `${abiertaPintada('templarios', id)}.webp`);
      expect({ tramo: r.tramo, en: r.en, ancho: r.ancho, alto: r.alto }).toEqual({
        tramo: e.tramo,
        en: e.en,
        ancho: e.ancho,
        alto: e.alto,
      });
      expect(
        createHash('sha256').update(r.rgba).digest('hex'),
        'la versión abierta no es la de sus fuentes: pnpm taller recortar-base templarios',
      ).toBe(e.origen);
    },
  );
});
