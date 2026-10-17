/**
 * Las pruebas del mapa de profundidad (10-10-2026, `tools/taller/experimento.ts`):
 * sus encargos, los papeles nuevos y las hojas de profundidad del maniquí.
 */
import { join, resolve } from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { encargoSchema, prefacioDeReferencias, promptDe } from '../tools/taller/encargo.js';
import { poseDeLaProcedencia } from '../tools/taller/evaluar.js';
import {
  encargosConMotor,
  encargosDeEdicion,
  encargosDelExperimento,
  MOTORES,
  type NombreDeMotor,
  VARIANTES,
  type Variante,
} from '../tools/taller/experimento.js';
import { cargaDeFal } from '../tools/taller/fal.js';
import { unidad } from '../tools/taller/unidades.js';

const RAIZ = resolve(import.meta.dirname, '..');
const vampiro = unidad('heroe-vampiro');

describe('las pruebas del mapa de profundidad', () => {
  it('cada variante son las 8 hojas A, fuera de assets/, con su pose en su sitio', () => {
    const papeles: Record<Variante, string[]> = {
      control: ['pose', 'identidad', 'estilo'],
      'color-profundidad': ['pose', 'identidad', 'estilo', 'profundidad'],
      'solo-profundidad': ['pose-profundidad', 'identidad', 'estilo'],
      mezcla: ['pose', 'identidad', 'estilo'],
    };
    for (const v of Object.keys(VARIANTES) as Variante[]) {
      const encargos = encargosDelExperimento(vampiro, v);
      expect(encargos.map((e) => e.id)).toEqual(
        Array.from({ length: 8 }, (_, d) => `heroe-vampiro-exp-${v}-d${d}-a`),
      );
      for (const [d, e] of encargos.entries()) {
        expect(encargoSchema.parse(e)).toBeTruthy();
        expect(e.salida).toBe(`.cache/experimentos/${v}/heroe-vampiro/d${d}/hoja-a`);
        expect(e.ocho).toEqual({ direccion: d, hoja: 'a' });
        expect(e.referencias.map((r) => r.papel)).toEqual(papeles[v]);
        const pose = `assets/unidades/_poses/unidades/heroe-vampiro-8d/d${d}-a`;
        const sufijo = {
          control: '',
          'color-profundidad': '',
          'solo-profundidad': '.profundidad',
          mezcla: '.mezcla',
        }[v];
        expect(e.referencias[0]?.ruta).toBe(`${pose}${sufijo}.png`);
        if (v === 'color-profundidad')
          expect(e.referencias[3]?.ruta).toBe(`${pose}.profundidad.png`);
      }
    }
  });

  it('un atlas empieza por la pose, en color o en profundidad; el mapa que complementa va detrás', () => {
    const [e] = encargosDelExperimento(vampiro, 'color-profundidad');
    if (e === undefined) throw new Error('sin encargos');
    const [pose, identidad, estilo, profundidad] = e.referencias;
    expect(() =>
      encargoSchema.parse({ ...e, referencias: [profundidad, identidad, estilo] }),
    ).toThrow(/primero la referencia de pose/);
    expect(prefacioDeReferencias(e.referencias)).toMatch(/La imagen 4 es el MAPA DE PROFUNDIDAD/);
    const solo = encargosDelExperimento(vampiro, 'solo-profundidad')[0];
    expect(prefacioDeReferencias(solo?.referencias ?? [])).toMatch(
      /La imagen 1 es la REFERENCIA DE POSE, dada como MAPA DE PROFUNDIDAD/,
    );
    expect(pose?.papel).toBe('pose');
  });

  it('las hojas de profundidad y mezcla del maniquí tienen la silueta de su hoja de color', async () => {
    // `escalaDePose` y el evaluador leen la alfa de la primera referencia.
    const base = join(RAIZ, 'assets/unidades/_poses/unidades/heroe-vampiro-8d/d1-a');
    const alfa = async (ruta: string) =>
      (await sharp(ruta).ensureAlpha().extractChannel(3).raw().toBuffer()).toString('base64');
    const color = await alfa(`${base}.png`);
    expect(await alfa(`${base}.profundidad.png`)).toBe(color);
    expect(await alfa(`${base}.mezcla.png`)).toBe(color);
    // Y la profundidad tiene volumen: más de un gris dentro de la figura.
    const { data } = await sharp(`${base}.profundidad.png`)
      .raw()
      .toBuffer({ resolveWithObject: true });
    const grises = new Set<number>();
    for (let i = 0; i < data.length; i += 4)
      if ((data[i + 3] as number) >= 40) grises.add(data[i] as number);
    expect(grises.size).toBeGreaterThan(100);
  });

  it('una edición parte de la hoja pintada de su base y escala contra el maniquí que apunta', () => {
    const pose = 'assets/unidades/_poses/unidades/heroe-vampiro-8d/d1-a.png';
    const [, editar] = encargosDeEdicion(vampiro, 'editar', 'control');
    const [, silueta] = encargosDeEdicion(vampiro, 'editar-silueta', 'mezcla');
    expect(editar?.id).toBe('heroe-vampiro-exp-editar-de-control-d1-a');
    expect(editar?.referencias).toEqual([
      { ruta: '.cache/experimentos/control/heroe-vampiro/d1/hoja-a.webp', papel: 'editar' },
      { ruta: pose, papel: 'pose' },
    ]);
    expect(silueta?.referencias).toEqual([
      {
        ruta: '.cache/experimentos/editar-silueta-de-mezcla/heroe-vampiro/d1/entrada-silueta.png',
        papel: 'editar-silueta',
      },
    ]);
    for (const e of [editar, silueta]) {
      if (e === undefined) throw new Error('sin encargo');
      expect(encargoSchema.parse(e)).toBeTruthy();
      expect(e.ocho).toEqual({ direccion: 1, hoja: 'a', pose });
      expect(e.salida.startsWith('.cache/experimentos/')).toBe(true);
      const prompt = promptDe(e);
      expect(prompt).toMatch(/^EDITA la imagen 1/);
      expect(prompt).toMatch(/Las mismas figuras en las mismas celdas/);
      expect(prompt).not.toMatch(/Fila 2: las siete fases de marcha/);
    }
    expect(promptDe(silueta as NonNullable<typeof silueta>)).toMatch(/BORRA la silueta/);
    // Editar sin decir contra qué maniquí, o apuntar uno sin editar, no vale.
    const { pose: _, ...sinPose } = editar?.ocho ?? { direccion: 1, hoja: 'a' as const };
    expect(() => encargoSchema.parse({ ...editar, ocho: sinPose })).toThrow(/ocho\.pose/);
    const [normal] = encargosDelExperimento(vampiro, 'control');
    expect(() => encargoSchema.parse({ ...normal, ocho: { ...normal?.ocho, pose } })).toThrow(
      /ocho\.pose/,
    );
    // La procedencia de una edición dice su maniquí aparte.
    expect(poseDeLaProcedencia({ pose, referencias: editar?.referencias ?? [] })).toBe(pose);
    expect(poseDeLaProcedencia({ referencias: [{ ruta: pose }] })).toBe(pose);
  });

  it('con un motor de fal: el payload de cada endpoint, el prompt y el fondo que da', () => {
    const refs = [
      { papel: 'pose-profundidad' as const, uri: 'data:image/png;base64,P' },
      { papel: 'identidad' as const, uri: 'data:image/jpeg;base64,I' },
      { papel: 'estilo' as const, uri: 'data:image/jpeg;base64,E' },
    ];
    for (const m of Object.keys(MOTORES) as NombreDeMotor[]) {
      const [, e] = encargosConMotor(vampiro, m);
      if (e === undefined) throw new Error('sin encargo');
      const valido = encargoSchema.parse(e);
      expect(e.id).toBe(`heroe-vampiro-exp-fal-${m}-d1-a`);
      expect(e.salida).toBe(`.cache/experimentos/fal-${m}/heroe-vampiro/d1/hoja-a`);
      expect(e.referencias[0]?.papel).toBe('pose-profundidad');
      const prompt = promptDe(valido);
      const carga = cargaDeFal(valido.motor as NonNullable<typeof valido.motor>, prompt, refs);
      expect(carga).toMatchObject(MOTORES[m].params);
      if (m === 'flux-depth') {
        // ControlNet: la profundidad es el control y el resto no viaja; prompt en inglés.
        expect(carga.control_lora_image_url).toBe('data:image/png;base64,P');
        expect(carga.preprocess_depth).toBe(false);
        expect(carga.image_urls).toBeUndefined();
        expect(prompt).toMatch(/^A sprite sheet/);
      } else {
        expect(carga.image_urls).toEqual(refs.map((r) => r.uri));
        expect(prompt).toMatch(/^Genera UNA imagen\.\n/);
        expect(prompt).not.toMatch(/herramienta de imágenes integrada/);
        expect(prompt).toMatch(
          MOTORES[m].fondo === 'liso' ? /Fondo LISO/ : /alfa real totalmente transparente/,
        );
      }
    }
    const [, e] = encargosConMotor(vampiro, 'qwen-edit');
    expect(() =>
      encargoSchema.parse({ ...e, motor: { ...e?.motor, endpoint: 'https://fal.run/x' } }),
    ).toThrow();
  });
});
