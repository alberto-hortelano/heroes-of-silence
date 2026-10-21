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
  OSCURO_DE_LA_ESPALDA,
  oscuroAlNorteDeLasEspaldas,
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

/**
 * En la orden lenta, 1-40; en `verify`, la 3 y la 15. Era la 2 (el istmo de la
 * auditoría 5) hasta que las dos puertas de la mina (#230) la dejaron sin meseta
 * (09-10-2026: 0 rebordes; la 3 tiene 50 y 33 671 píxeles de agua en lo alto sin
 * el escalón). La 443 se quedó sin meseta con los ríos (#144, 16-10-2026): va
 * la 15, la de más rebordes de 1-20 (71; la 3, 25). La 15 se quedó sin meseta
 con el río de una casilla (#144, paso 2): va la 16, la de más rebordes de 1-20
 (65; la 3, 38). Con el río continuo (#144) la 3 y la 16 se quedan sin meseta:
 van la 17 y la 13, las de más rebordes de 1-20 (56 y 45; la 13 tiene 12 371
 píxeles de agua en lo alto sin el escalón). Sin minas (21-10-2026) la 13 se
 queda sin meseta: van la 17 y la 1, las de más rebordes de 1-20 (44 y 40; la
 1 tiene 5 738 píxeles de agua en lo alto sin el escalón).
 */
const SEMILLAS = LENTO ? rango(1, 40) : [17, 1];

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
    for (const s of [17, 1]) expect(partidaDe(s).escena.relieve.rebordes.length).toBeGreaterThan(0);
  });

  for (const semilla of SEMILLAS)
    it(`semilla ${semilla}: cada espalda lleva su canto`, () => {
      expect(espaldasSinCanto(partidaDe(semilla).escena)).toEqual([]);
    });

  it('el guardia del canto muerde: sin canto, la s1 tiene espaldas sin él', () => {
    const e = partidaDe(1).escena;
    const np = nivelPintado(e);
    const vacio = {
      ancho: np.ancho,
      alto: np.alto,
      R,
      alfa: new Uint8ClampedArray(np.nivel.length),
    };
    expect(espaldasSinCanto(e, vacio).length).toBeGreaterThan(0);
  });

  it('el guardia del labio muerde: sin labio, la s1 tiene espaldas sin él', () => {
    const e = partidaDe(1).escena;
    const np = nivelPintado(e);
    const vacio = {
      ancho: np.ancho,
      alto: np.alto,
      R,
      alfa: new Uint8ClampedArray(np.nivel.length),
    };
    expect(espaldasSinLabio(e, vacio).length).toBeGreaterThan(0);
  });

  it('el guardia muerde: sin el escalón, la s1 tenía agua en lo alto', () => {
    expect(aguaEnLoAlto(partidaDe(1).escena, true)).toBeGreaterThan(0);
  });
});

/**
 * En la orden lenta, 1-40; en `verify`, la 16 (la 15 hasta el río de una
 * casilla, #144 paso 2, que la dejó sin meseta; la 55, la marca de #223, hasta
 * los ríos, #144; la 16 es la de más espaldas con oscuro de 1-20, 65) y la 3
 * (la 2 hasta #230, que la dejó sin meseta). Con el río continuo (#144) las dos
 * se quedan sin meseta: la 17, la de más espaldas con oscuro de 1-20 (56), y
 * la 13 (45). Sin minas (21-10-2026), la 17 (44) y la 1 (40).
 */
const SEMILLAS_DEL_OSCURO = LENTO ? rango(1, 40) : [17, 1];

describe('la espalda, una línea nítida (#223)', () => {
  for (const semilla of SEMILLAS_DEL_OSCURO)
    it(`semilla ${semilla}: lo oscuro al norte de cada espalda no pasa de ${OSCURO_DE_LA_ESPALDA.ancho} casillas del filo`, () => {
      const anchas = oscuroAlNorteDeLasEspaldas(partidaDe(semilla).escena).filter(
        (q) => q.ancho > OSCURO_DE_LA_ESPALDA.ancho,
      );
      expect(anchas).toEqual([]);
    });

  it('la muestra del bucle rápido mide espaldas con oscuro', () => {
    // Si el guardia no encontrara ningún oscuro que medir, pasaría sin mirar.
    // Más de 10 por semilla: con los mapas de #224 una de las dos da 17.
    for (const s of [17, 1])
      expect(
        oscuroAlNorteDeLasEspaldas(partidaDe(s).escena).filter((q) => q.ancho > 0).length,
      ).toBeGreaterThan(10);
  });

  it('s17 (31,16): al norte, el hoyo del nodo de acantilado; al norte del hoyo, la sombra de la ladera de (30,14), que no es de la espalda', () => {
    // Con los ríos (#144, 16-10-2026) era s36 (10,33): el nodo de (10,32), con
    // camino, va a lo bajo (0) entre dos acantilados a 2, y lo alto se lo come
    // casi entero. La tirada de oscuro subía del canto, por el hoyo, a la
    // sombra que la ladera de (9,31) echa sobre (10,31), y salía de 0,56: solo
    // se apartaban las columnas de las laderas de la casilla del norte, no de
    // la de su norte. Con el río de una casilla (#144, paso 2), s41 (19,10): el
    // nodo de acantilado de (19,9), con camino, a 1 entre dos acantilados a 2.
    // Con el río continuo (#144), s26 (13,11): el nodo de acantilado de (13,10),
    // con camino, a 1 entre dos a 2. Con las puertas de las ciudades (fase 2,
    // 21-10-2026), s4 (12,31): el mismo dibujo, buscado en 1-200 con la sombra
    // de su ladera en la fila del norte; s4 es la primera. Sin minas
    // (21-10-2026), s17 (31,16), la primera de 1-80 con el nodo de acantilado.
    const [X, Y] = [31, 16];
    const e = partidaDe(17).escena;
    const n = (x: number, y: number) => e.nivel[y * e.W + x];
    // Que el caso siga ahí: el hoyo y, al norte, la sombra de la ladera.
    expect([
      n(X, Y),
      n(X, Y - 1),
      n(X - 1, Y - 1),
      n(X + 1, Y - 1),
      n(X - 1, Y - 2),
      n(X, Y - 2),
    ]).toEqual([2, 1, 2, 2, 2, 1]);
    const np = nivelPintado(e);
    const sombra = sombraAlPie(e, np);
    const enLaDelNorte = (px: number) =>
      Array.from({ length: R }, (_, k) => sombra.alfa[((Y - 2) * R + k) * np.ancho + px] as number);
    const columnas = Array.from({ length: R }, (_, k) => X * R + k).filter((px) =>
      enLaDelNorte(px).some((a) => a / 255 >= OSCURO_DE_LA_ESPALDA.umbral),
    );
    expect(columnas.length).toBeGreaterThan(0);
    const espalda = oscuroAlNorteDeLasEspaldas(e).find((q) => q.x === X && q.y === Y);
    expect(espalda?.ancho).toBeGreaterThan(0);
    expect(espalda?.ancho).toBeLessThanOrEqual(OSCURO_DE_LA_ESPALDA.ancho);
  });

  it('el guardia muerde: con todo lo bajo oscuro, la s12 tiene espaldas que pasan', () => {
    const e = partidaDe(12).escena;
    const np = nivelPintado(e);
    const negro = {
      ancho: np.ancho,
      alto: np.alto,
      R,
      alfa: new Uint8ClampedArray(np.nivel.length).fill(255),
    };
    const anchas = oscuroAlNorteDeLasEspaldas(e, { sombra: negro, canto: negro }).filter(
      (q) => q.ancho > OSCURO_DE_LA_ESPALDA.ancho,
    );
    expect(anchas.length).toBeGreaterThan(0);
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
  /** Lo más que vale la sombra en la columna `x`, entre `y0` e `y1`. */
  const maxEnLaColumna = (x: number, y0: number, y1: number) => {
    let v = 0;
    for (let py = Math.floor(y0 * R); py < y1 * R; py++)
      v = Math.max(v, s.alfa[py * s.ancho + Math.floor(x * R)] as number);
    return v;
  };

  it('cae al este, hacia donde la echa la luz, y no al norte (es el canto, #223), ni al oeste ni al sur ni sobre lo alto', () => {
    expect(en(5.5, 4)).toBeGreaterThan(0); // al este, pasado el talud
    expect(maxEnLaColumna(4, 2, 3)).toBe(0); // al norte, la espalda
    expect(en(2.6, 4)).toBe(0); // al oeste
    expect(en(4, 5.9)).toBe(0); // al sur
    for (let p = 0; p < s.alfa.length; p++) if (np.nivel[p] === 2) expect(s.alfa[p]).toBe(0);
  });

  it('en un barranco de una casilla, solo el contacto: no llena el hueco (#223)', () => {
    // Lo alto a 2 en las columnas 0-2 y 4-7; la columna 3, a 0, es el barranco.
    const b = rejilla(8, 6, (x) => (x === 3 ? 0 : 2));
    const sb = sombraAlPie(b, nivelPintado(b));
    const enB = (x: number, y: number) =>
      sb.alfa[Math.floor(y * R) * sb.ancho + Math.floor(x * R)] as number;
    for (let x = 3 + 0.15; x < 4; x += 1 / R) expect(enB(x, 3)).toBe(0);
    // Y con la casilla del este baja, la ladera echa su sombra entera.
    const ladera = rejilla(8, 6, (x) => (x < 3 ? 2 : 0));
    const sl = sombraAlPie(ladera, nivelPintado(ladera));
    expect(sl.alfa[3 * R * sl.ancho + Math.floor(3.6 * R)]).toBeGreaterThan(0);
  });

  it('por donde baja una rampa no hay sombra', () => {
    const rampa = sombraAlPie(e, np, (alto, bajo) => alto === 4 * 8 + 4 && bajo === 4 * 8 + 5);
    expect(rampa.alfa[Math.floor(4.5 * R) * s.ancho + Math.floor(5.6 * R)]).toBe(0);
    expect(en(5.6, 4.5)).toBeGreaterThan(0);
  });
});
