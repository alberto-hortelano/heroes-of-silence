/**
 * La base comparte la escala del combate (vuelta 2, preguntas A y B): un adulto
 * mide lo mismo en una batalla y en la base con el mismo lienzo, porque el paso
 * sale de la misma cuenta (`escalaDelCombate`), no de una copia.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { camaraDeLaBase } from '../src/client/render/base/camara.js';
import { cajaDeFiguraEn } from '../src/client/render/batalla.js';
import {
  ANCHO_DEL_COMBATE_EN_MOVIL,
  pasoDeLaBase,
  tableroPara,
} from '../src/client/render/proyeccion.js';
import { disposicionDe } from '../src/shared/base.js';

describe('la escala de la base es la del combate', () => {
  it('el paso de la base es el de una batalla en el mismo lienzo de escritorio', () => {
    for (const [a, h] of [
      [1086, 778],
      [1600, 860],
      [2400, 1300],
    ] as const) {
      expect(pasoDeLaBase(a, h), `${a}×${h}`).toBe(tableroPara(a, h).paso);
    }
  });

  it('en el móvil, el de una batalla en el lienzo de 860 px que se desplaza', () => {
    expect(pasoDeLaBase(374, 380)).toBe(tableroPara(860, 380).paso);
  });

  it('el adulto de la base mide lo que el de la batalla, a 1440×900', () => {
    const d = disposicionDe('knight');
    // El lienzo que deja la página a 1440×900, medido con capturas (1086×778).
    const t = camaraDeLaBase({ ancho: 1086, alto: 778 }, 0);
    const batalla = tableroPara(1086, 778);
    expect(cajaDeFiguraEn(t, d.entrada).alto).toBe(batalla.paso * 0.95);
  });

  it('el 860 de la hoja de estilos es `ANCHO_DEL_COMBATE_EN_MOVIL`', () => {
    const css = readFileSync(join(import.meta.dirname, '../src/client/style.css'), 'utf8');
    const regla = /#app\[data-escena='battle'\] #canvas \{ width: (\d+)px; \}/.exec(css);
    expect(regla, 'no encuentro el ancho del lienzo de batalla en el móvil').not.toBeNull();
    expect(Number(regla?.[1])).toBe(ANCHO_DEL_COMBATE_EN_MOVIL);
  });
});
