/**
 * La escala de la base sale de la del combate (vuelta 2, preguntas A y B), pero
 * desde el 20-10-2026 solo de su alto (C16 de la vuelta 2 de la morada: «al hacer
 * la pantalla más estrecha se encoge la parte donde se ve la base; eso no pasa en
 * el mapa»): el paso es el de una batalla en un marco 20:11 de ese alto, el marco
 * en que se aprobó el encuadre, y estrechar la ventana enseña menos plaza a la
 * misma escala.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { camaraDeLaBase } from '../src/client/render/base/camara.js';
import { cajaDeFiguraEn } from '../src/client/render/batalla.js';
import {
  ANCHO_DEL_COMBATE_EN_MOVIL,
  MARCO_DE_LA_BASE,
  pasoDeLaBase,
  tableroPara,
} from '../src/client/render/proyeccion.js';
import { disposicionDe } from '../src/shared/base.js';

describe('la escala de la base: la del combate en un marco 20:11 de su alto', () => {
  it('con el mismo alto, el mismo paso a cualquier ancho', () => {
    for (const h of [380, 594, 773, 900, 1300]) {
      const paso = pasoDeLaBase(h);
      for (const a of [360, 454, 770, 1080, 1440, 2400]) {
        const t = camaraDeLaBase({ ancho: a, alto: h }, 0);
        expect(t.paso, `${a}×${h}`).toBe(paso);
      }
    }
  });

  it('es el de una batalla en un marco 20:11 de ese alto (el encuadre aprobado el 09-10)', () => {
    expect(MARCO_DE_LA_BASE).toBe(20 / 11);
    for (const h of [594, 773, 900]) {
      expect(pasoDeLaBase(h), `alto ${h}`).toBeCloseTo(tableroPara((h * 20) / 11, h).paso, 9);
    }
    // 1080×594, el lienzo de 20:11 a 1440×900: 85,7, como antes del cambio.
    expect(pasoDeLaBase(594)).toBeCloseTo(85.714, 3);
  });

  it('en el móvil, el de una batalla en el lienzo de 860 px que se desplaza', () => {
    expect(pasoDeLaBase(380)).toBe(tableroPara(860, 380).paso);
    expect(pasoDeLaBase(380)).toBeCloseTo(63.5, 1);
  });

  it('el adulto de la base mide 0,95 pasos de la base', () => {
    const d = disposicionDe('templarios');
    const t = camaraDeLaBase({ ancho: 1086, alto: 778 }, 0);
    expect(cajaDeFiguraEn(t, d.entrada).alto).toBe(pasoDeLaBase(778) * 0.95);
  });

  it('el 860 de la hoja de estilos es `ANCHO_DEL_COMBATE_EN_MOVIL`', () => {
    const css = readFileSync(join(import.meta.dirname, '../src/client/style.css'), 'utf8');
    const regla = /#app\[data-escena='battle'\] #canvas \{ width: (\d+)px; \}/.exec(css);
    expect(regla, 'no encuentro el ancho del lienzo de batalla en el móvil').not.toBeNull();
    expect(Number(regla?.[1])).toBe(ANCHO_DEL_COMBATE_EN_MOVIL);
  });

  it('el marco de la base no lleva proporción propia en la hoja de estilos: va a todo el alto, como el mapa', () => {
    const css = readFileSync(join(import.meta.dirname, '../src/client/style.css'), 'utf8');
    const reglas = css.split('}').filter((r) => /data-escena='town'/.test(r));
    for (const r of reglas) expect(r, r).not.toMatch(/aspect-ratio|align-self/);
  });
});
