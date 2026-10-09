/**
 * El escalón entre niveles, pintado en el suelo (#211): el agua y el barro no
 * suben a lo alto, ninguna senda se pinta bajo el agua, cada punto toma los
 * suelos de su nivel, lo alto va más claro que lo bajo y la sombra cae al pie
 * de la caída hacia donde la echa la luz.
 */
import { describe, expect, it } from 'vitest';
import {
  aguaEnLoAlto,
  CANTO,
  cantoDeLasEspaldas,
  espaldasSinCanto,
  espaldasSinLabio,
  LABIO,
  labioDeLasEspaldas,
  mascaraDelAgua,
  nivelPintado,
  ORILLA,
  PX_DEL_ESCALON,
  sombraAlPie,
  tonoDeNivel,
} from '../src/client/render/escenario/escalon.js';
import { fronterasDelSuelo } from '../src/client/render/escenario/fronteras.js';
import { partidaDe } from './helpers.js';
import { LENTO, rango } from './lento.js';

const R = PX_DEL_ESCALON;

/** Una rejilla de `W × H` con el nivel que dé `nivel(x, y)`. */
function rejilla(W: number, H: number, nivel: (x: number, y: number) => number, semilla = 7) {
  return {
    W,
    H,
    semilla,
    nivel: Array.from({ length: W * H }, (_, i) => nivel(i % W, Math.floor(i / W))),
  };
}

/** La casilla de un píxel de una máscara a `R` por casilla. */
const casillaDe = (W: number, ancho: number, p: number) =>
  Math.floor(Math.floor(p / ancho) / R) * W + Math.floor((p % ancho) / R);

describe('el nivel pintado', () => {
  // Una meseta a 2 en las tres columnas de la izquierda; lo demás, a 0.
  const e = rejilla(8, 6, (x) => (x < 3 ? 2 : 0));
  const np = nivelPintado(e);

  it('nunca baja de su casilla, y lo alto se adelanta sobre lo bajo entre ORILLA.menos y ORILLA.mas', () => {
    let adelantado = 0;
    for (let p = 0; p < np.nivel.length; p++) {
      const suyo = e.nivel[casillaDe(e.W, np.ancho, p)] as number;
      expect(np.nivel[p]).toBeGreaterThanOrEqual(suyo);
      if ((np.nivel[p] as number) > suyo) {
        adelantado++;
        // Lo que entra en la casilla baja, desde el lado x = 3.
        const x = ((p % np.ancho) + 0.5) / R;
        expect(x - 3).toBeLessThanOrEqual(ORILLA.mas + 1 / R);
      }
    }
    expect(adelantado).toBeGreaterThan(0);
    // Y por toda la orilla llega al menos `ORILLA.menos`.
    for (let py = R; py < np.alto - R; py++)
      expect(np.nivel[py * np.ancho + Math.floor((3 + ORILLA.menos / 2) * R)]).toBe(2);
  });

  it('es el mismo con la misma semilla y otro con otra', () => {
    expect(nivelPintado(e).nivel).toEqual(np.nivel);
    expect(nivelPintado({ ...e, semilla: 8 }).nivel).not.toEqual(np.nivel);
  });
});

describe('el agua no sube a lo alto', () => {
  // Agua a −1 en las columnas 4 y más; tierra a 2 en las de la izquierda.
  const e = rejilla(8, 6, (x) => (x >= 4 ? -1 : 2));
  const agua = (i: number) => i % e.W >= 4;

  it('ni un píxel de agua en una casilla más alta, ni en el que lee la ampliación; sin el escalón, sí', () => {
    const conEscalon = mascaraDelAgua(e, nivelPintado(e), agua, 0.55);
    const antes = mascaraDelAgua(e, null, agua, 0.55);
    const enLoAlto = (alfa: Uint8ClampedArray) => {
      let n = 0;
      for (let p = 0; p < alfa.length; p++)
        if ((alfa[p] as number) > 0 && ((p % conEscalon.ancho) + 1.5) / R <= 4) n++;
      return n;
    };
    expect(enLoAlto(conEscalon.alfa)).toBe(0);
    expect(enLoAlto(antes.alfa)).toBeGreaterThan(0);
    // Y el agua sigue entera lejos de la orilla.
    expect(conEscalon.alfa[3 * R * conEscalon.ancho + 7 * R]).toBe(255);
  });

  it('el agua de un lago a su nivel sí llega a la orilla de su altura', () => {
    const lago = rejilla(8, 6, () => 1);
    const m = mascaraDelAgua(lago, nivelPintado(lago), agua, 0.55);
    // A media casilla del lado, en la tierra, todavía hay barro.
    expect(m.alfa[3 * R * m.ancho + Math.floor(3.6 * R)]).toBeGreaterThan(0);
  });
});

describe('el labio de la espalda (#217)', () => {
  // Una meseta a 2 de 4×3 casillas (x 2-5, y 2-4) en medio de lo bajo, a 1.
  const e = rejilla(8, 7, (x, y) => (x >= 2 && x < 6 && y >= 2 && y < 5 ? 2 : 1));
  const np = nivelPintado(e);
  const m = labioDeLasEspaldas(np);
  const en = (x: number, y: number) =>
    m.alfa[Math.floor(y * R) * m.ancho + Math.floor(x * R)] as number;
  /** Lo más que vale el labio en la columna `x`, entre `y0` e `y1`. */
  const maxEn = (x: number, y0: number, y1: number) => {
    let v = 0;
    for (let py = Math.floor(y0 * R); py < y1 * R; py++)
      v = Math.max(v, m.alfa[py * m.ancho + Math.floor(x * R)] as number);
    return v;
  };

  it('corre seguido por todo el filo norte, en lo alto', () => {
    for (let x = 2.1; x < 5.9; x += 1 / R) {
      // El filo cae entre lo que lo alto se adelanta y el lado de la casilla.
      // Suavizado (`SUAVE_DEL_TONO`), el pico del filo queda en ~0,55 de `LABIO.luz`:
      // la mitad es lo que pide `espaldasSinLabio`.
      expect(maxEn(x, 2 - ORILLA.mas - 0.1, 2.2)).toBeGreaterThanOrEqual((255 * LABIO.luz) / 2);
    }
    // En lo bajo, solo lo que el suavizado derrama al píxel de fuera del filo.
    for (let p = 0; p < m.alfa.length; p++)
      if (np.nivel[p] !== 2) expect(m.alfa[p]).toBeLessThan((255 * LABIO.luz) / 2);
  });

  it('no va al sur, ni al este ni al oeste, ni dentro de la meseta ni en lo llano', () => {
    expect(maxEn(3.5, 4.5, 5.5)).toBe(0); // la cara al sur
    expect(en(1.95, 3.5)).toBe(0); // el oeste
    expect(en(6.05, 3.5)).toBe(0); // el este
    expect(en(3.5, 3)).toBe(0); // en medio de lo alto
    expect(maxEn(0.5, 0, 7)).toBe(0); // lo llano
  });
});

describe('el canto de la espalda (#219)', () => {
  // La misma meseta a 2 de 4×3 casillas (x 2-5, y 2-4) en medio de lo bajo, a 1.
  const e = rejilla(8, 7, (x, y) => (x >= 2 && x < 6 && y >= 2 && y < 5 ? 2 : 1));
  const np = nivelPintado(e);
  const m = cantoDeLasEspaldas(e, np);
  /** Lo más que vale `mascara` en la columna `x`, entre `y0` e `y1`. */
  const maxEn = (mascara: typeof m, x: number, y0: number, y1: number) => {
    let v = 0;
    for (let py = Math.floor(y0 * R); py < y1 * R; py++)
      v = Math.max(v, mascara.alfa[py * mascara.ancho + Math.floor(x * R)] as number);
    return v;
  };
  const mitad = (255 * CANTO.oscuro) / 2;

  it('corre seguido por todo el filo norte, en lo bajo, y no entra en lo alto', () => {
    for (let x = 2.1; x < 5.9; x += 1 / R)
      expect(maxEn(m, x, 2 - ORILLA.mas - CANTO.ancho, 2)).toBeGreaterThanOrEqual(mitad);
    // En lo alto, solo lo que el suavizado derrama al píxel de dentro del filo.
    for (let p = 0; p < m.alfa.length; p++)
      if (np.nivel[p] === 2) expect(m.alfa[p]).toBeLessThan(mitad);
  });

  it('no va al sur, ni al este ni al oeste, ni lejos del filo', () => {
    expect(maxEn(m, 3.5, 5, 7)).toBe(0); // al pie de la cara, al sur
    expect(maxEn(m, 1.5, 0, 7)).toBe(0); // al oeste
    expect(maxEn(m, 6.5, 0, 7)).toBe(0); // al este
    expect(maxEn(m, 3.5, 0, 1.4)).toBe(0); // lejos del filo, al norte
  });

  it('por donde baja una rampa al norte no hay canto', () => {
    const rampa = (alto: number, bajo: number) => alto === 2 * 8 + 3 && bajo === 1 * 8 + 3;
    const conRampa = cantoDeLasEspaldas(e, np, rampa);
    expect(maxEn(conRampa, 3.5, 1, 2)).toBe(0);
    expect(maxEn(conRampa, 4.5, 1, 2)).toBeGreaterThanOrEqual(mitad);
  });
});

/** En la orden lenta, 1-40; en `verify`, la 2 (el istmo de la auditoría 5) y la 443. */
const SEMILLAS = LENTO ? rango(1, 40) : [2, 443];

describe('en los mapas reales', () => {
  for (const semilla of SEMILLAS)
    it(`semilla ${semilla}: ningún agua ni barro en lo alto`, () => {
      expect(aguaEnLoAlto(partidaDe(semilla).escena)).toBe(0);
    });

  for (const semilla of SEMILLAS)
    it(`semilla ${semilla}: cada espalda lleva su labio`, () => {
      expect(espaldasSinLabio(partidaDe(semilla).escena)).toEqual([]);
    });

  it('la muestra del bucle rápido tiene espaldas que mirar', () => {
    for (const s of [2, 443])
      expect(partidaDe(s).escena.relieve.rebordes.length).toBeGreaterThan(0);
  });

  for (const semilla of SEMILLAS)
    it(`semilla ${semilla}: cada espalda lleva su canto`, () => {
      expect(espaldasSinCanto(partidaDe(semilla).escena)).toEqual([]);
    });

  it('el guardia del canto muerde: sin canto, la s2 tiene espaldas sin él', () => {
    const e = partidaDe(2).escena;
    const np = nivelPintado(e);
    const vacio = {
      ancho: np.ancho,
      alto: np.alto,
      R,
      alfa: new Uint8ClampedArray(np.nivel.length),
    };
    expect(espaldasSinCanto(e, vacio).length).toBeGreaterThan(0);
  });

  it('el guardia del labio muerde: sin labio, la s2 tiene espaldas sin él', () => {
    const e = partidaDe(2).escena;
    const np = nivelPintado(e);
    const vacio = {
      ancho: np.ancho,
      alto: np.alto,
      R,
      alfa: new Uint8ClampedArray(np.nivel.length),
    };
    expect(espaldasSinLabio(e, vacio).length).toBeGreaterThan(0);
  });

  it('el guardia muerde: sin el escalón, la s2 tenía agua en lo alto', () => {
    expect(aguaEnLoAlto(partidaDe(2).escena, true)).toBeGreaterThan(0);
  });
});

describe('las fronteras del suelo, por niveles', () => {
  // Nieve arriba (a 2) y tierra abajo (a 0), con la frontera en x = 3.
  const e = {
    ...rejilla(8, 6, (x) => (x < 3 ? 2 : 0)),
    suelo: Array.from({ length: 48 }, (_, i) => (i % 8 < 3 ? 'snow' : 'dirt')),
  };

  it('cada punto se reparte solo entre los suelos de su nivel pintado; sin niveles, el serpenteo los cruza', () => {
    const np = nivelPintado(e);
    const fr = fronterasDelSuelo(
      e,
      () => undefined,
      R,
      (p) => np.nivel[p] as number,
    );
    const nieve = fr.alfas[fr.suelos.indexOf('snow')] as Uint8ClampedArray;
    const tierra = fr.alfas[fr.suelos.indexOf('dirt')] as Uint8ClampedArray;
    let cruzan = 0;
    for (let p = 0; p < nieve.length; p++) {
      if (np.nivel[p] === 2) expect(tierra[p]).toBe(0);
      else expect(nieve[p]).toBe(0);
    }
    const sin = fronterasDelSuelo(
      { W: e.W, H: e.H, semilla: e.semilla, suelo: e.suelo },
      () => undefined,
      R,
    );
    const tierraSin = sin.alfas[sin.suelos.indexOf('dirt')] as Uint8ClampedArray;
    for (let p = 0; p < tierraSin.length; p++)
      if (np.nivel[p] === 2 && (tierraSin[p] as number) > 0) cruzan++;
    expect(cruzan).toBeGreaterThan(0);
  });
});

describe('el tono y la sombra del desnivel', () => {
  it('lo alto va más claro que lo bajo, nivel a nivel', () => {
    const brillo = (n: number) => tonoDeNivel(n).luz - tonoDeNivel(n).sombra;
    for (let n = -1; n < 3; n++) expect(brillo(n + 1)).toBeGreaterThan(brillo(n));
  });

  it('el escalón entre 1 y 2 es al menos el doble del de #211 (6 % de sombra y 8 % de luz), #217', () => {
    // Decisión del usuario tras la auditoría 6: «2-3 veces más fuerte». La luz
    // va en `soft-light`, que pesa menos que `screen` alfa a alfa: medido en el
    // taller, la lava de s13 pasa de ΔL 14,7 a 31,0 y la nieve de s2, de 4,6 a 14,9.
    const brillo = (n: number) => tonoDeNivel(n).luz - tonoDeNivel(n).sombra;
    expect(brillo(2) - brillo(1)).toBeGreaterThanOrEqual(2 * (0.08 + 0.06));
  });

  // Un bloque a 2 de 2×2 casillas en medio de lo bajo, a 0.
  const e = rejilla(8, 8, (x, y) => (x >= 3 && x < 5 && y >= 3 && y < 5 ? 2 : 0));
  const np = nivelPintado(e);
  const s = sombraAlPie(e, np);
  const en = (x: number, y: number) =>
    s.alfa[Math.floor(y * R) * s.ancho + Math.floor(x * R)] as number;

  it('cae al este y al norte, hacia donde la echa la luz, y no al oeste ni al sur ni sobre lo alto', () => {
    expect(en(5.5, 4)).toBeGreaterThan(0); // al este, pasado el talud
    expect(en(4, 2.75)).toBeGreaterThan(0); // al norte, la espalda
    expect(en(2.6, 4)).toBe(0); // al oeste
    expect(en(4, 5.9)).toBe(0); // al sur
    for (let p = 0; p < s.alfa.length; p++) if (np.nivel[p] === 2) expect(s.alfa[p]).toBe(0);
  });

  it('por donde baja una rampa no hay sombra', () => {
    const rampa = sombraAlPie(e, np, (alto, bajo) => alto === 4 * 8 + 4 && bajo === 4 * 8 + 5);
    expect(rampa.alfa[Math.floor(4.5 * R) * s.ancho + Math.floor(5.6 * R)]).toBe(0);
    expect(en(5.6, 4.5)).toBeGreaterThan(0);
  });
});
