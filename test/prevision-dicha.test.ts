/**
 * La previsión de un golpe dicha en la barra (`textoDePrevision`), sobre
 * previsiones hechas a mano: lo que la frase promete de un golpe cuerpo a cuerpo
 * desde que se prevé cruce a cruce de la rueda (#253, 11-11-2026). Las cifras las
 * mira `test/prevision.test.ts` contra el daño de verdad; aquí, solo cómo se dicen.
 */
import { describe, expect, it } from 'vitest';
import { textoDePrevision } from '../src/client/batalla/prevision.js';
import type { PrevisionDeContraataque, PrevisionDeGolpe } from '../src/core/battle/prevision.js';

const CONTRAATAQUE: PrevisionDeContraataque = {
  seguro: false,
  danio: { min: 3, max: 20 },
  golpes: { min: 1, max: 2 },
  modificadores: [],
  conArma: 'con Espada (cuerpo a cuerpo)',
};

function golpe(cambios: Partial<PrevisionDeGolpe> = {}): PrevisionDeGolpe {
  return {
    kind: 'golpe',
    atacante: 'attacker-0',
    objetivo: 'defender-0',
    golpes: { min: 1, max: 2 },
    danio: { min: 9, max: 50 },
    bajas: { min: 0, max: 2 },
    leQuedan: { min: 15, max: 80 },
    modificadores: [
      { causa: 'con Lanza de jinete (carga)', factor: null },
      { causa: '−2 armadura', factor: null },
    ],
    contraataque: CONTRAATAQUE,
    salpica: [],
    ...cambios,
  };
}

const nombre = (id: string): string => id;

describe('la barra dice el golpe cuerpo a cuerpo según la rueda', () => {
  it('la frase entera: la horquilla de todos los cruces, cuántos golpes y el contraataque con los suyos', () => {
    expect(textoDePrevision(golpe(), nombre)).toBe(
      'Según la rueda, daño 9–50 por golpe (1–2 golpes): caerían 0–2 y le quedarían 15–80 PV. ' +
        'Contraataque con Espada (cuerpo a cuerpo), si sobrevive: 3–20 por golpe (1–2 golpes). ' +
        'Cuenta: con Lanza de jinete (carga); −2 armadura.',
    );
  });

  it('con un solo golpe posible no dice «por golpe»; con siempre los mismos, sin horquilla', () => {
    const uno = textoDePrevision(
      golpe({
        golpes: { min: 1, max: 1 },
        contraataque: { ...CONTRAATAQUE, seguro: true, golpes: { min: 1, max: 1 } },
      }),
      nombre,
    );
    expect(uno).not.toContain('por golpe');
    expect(uno).toContain('Contraataque con Espada (cuerpo a cuerpo): 3–20.');
    const dos = textoDePrevision(golpe({ golpes: { min: 2, max: 2 } }), nombre);
    expect(dos).toContain('daño 9–50 por golpe (2 golpes):');
  });

  it('ya no dice «el primer golpe, con la carga»: la carga entra en la horquilla', () => {
    expect(textoDePrevision(golpe(), nombre)).not.toContain('el primer golpe');
  });

  it('sin contraataque, lo dice', () => {
    expect(textoDePrevision(golpe({ contraataque: null }), nombre)).toContain('Sin contraataque.');
  });

  it('un disparo no va «según la rueda»: su tirada la fija la recta', () => {
    const disparo = textoDePrevision(
      golpe({ kind: 'disparo', golpes: { min: 2, max: 2 }, contraataque: null }),
      nombre,
    );
    expect(disparo.startsWith('Daño 9–50 por golpe (2 golpes):')).toBe(true);
    expect(disparo).not.toContain('Contraataque');
    expect(disparo).not.toContain('rueda');
  });
});
