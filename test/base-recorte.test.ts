/**
 * La morfología del recorte de la base (`tools/taller/recorte-base.ts`), sobre
 * imágenes sintéticas de 200×120: lo que es un edificio entra en la máscara y lo
 * que es el grano repintado de la placa, no. Es lo que decide qué píxeles del
 * cuadro maestro van a parar al juego; con arte de verdad lo mira `vista-base`.
 */
import { describe, expect, it } from 'vitest';
import { createRng } from '../src/core/rng.js';
import {
  desenfocar,
  FUNDIDO_DEL_PIE,
  lineaDelPie,
  mascaraDeLaDiferencia,
  mascaraDelPie,
  medir,
  sueloRepetible,
} from '../tools/taller/recorte-base.js';

const W = 200;
const H = 120;

/** Un RGB liso de `W × H`, con lo que diga `pintar` encima. */
function imagen(gris: number, pintar?: (x: number, y: number) => number | null): Uint8Array {
  const v = new Uint8Array(W * H * 3);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const c = pintar?.(x, y) ?? gris;
      v.set([c, c, c], (y * W + x) * 3);
    }
  return v;
}

/** El edificio: un rectángulo de otro tono, de (60, 30) a (120, 90). */
const EDIFICIO = { x0: 60, x1: 120, y0: 30, y1: 90 };
const dentro = (x: number, y: number): boolean =>
  x >= EDIFICIO.x0 && x < EDIFICIO.x1 && y >= EDIFICIO.y0 && y < EDIFICIO.y1;

describe('el recorte de la base', () => {
  const placa = imagen(120);
  const maestro = imagen(120, (x, y) => (dentro(x, y) ? 40 : null));
  const region = { x0: 40, x1: 150, pie: 100 };

  it('un rectángulo cambiado queda cubierto (≥ 95 %) y fuera de su región la máscara vale 0', () => {
    const m = mascaraDeLaDiferencia(W, H, maestro, placa, region);
    let cubiertos = 0;
    let total = 0;
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const a = m.v[y * W + x] as number;
        if (dentro(x, y)) {
          total++;
          if (a > 127) cubiertos++;
        }
        const fuera = x < region.x0 || x >= region.x1 || y >= region.pie;
        if (fuera) expect(a, `(${x}, ${y})`).toBe(0);
      }
    expect(cubiertos / total).toBeGreaterThanOrEqual(0.95);
  });

  it('una región que corta el edificio lo corta: lo de fuera de ella no entra', () => {
    const m = mascaraDeLaDiferencia(W, H, maestro, placa, { x0: 40, x1: 90, pie: 100 });
    for (let y = 0; y < H; y++)
      for (let x = 90; x < W; x++) expect(m.v[y * W + x], `(${x}, ${y})`).toBe(0);
  });

  it('el grano repintado (±15 en cada píxel) no entra', () => {
    const rng = createRng(7);
    const granulada = imagen(120, () => 120 + Math.round((rng.next() * 2 - 1) * 15));
    const m = mascaraDeLaDiferencia(W, H, granulada, placa, region);
    expect(m.v.every((a) => a === 0)).toBe(true);
    // Y con el edificio encima del grano, sale el edificio igual.
    const conEdificio = imagen(120, (x, y) =>
      dentro(x, y) ? 40 : 120 + Math.round((rng.next() * 2 - 1) * 15),
    );
    const e = medir(mascaraDeLaDiferencia(W, H, conEdificio, placa, region));
    expect(e).not.toBeNull();
    expect(e!.x0).toBeGreaterThanOrEqual(EDIFICIO.x0 - 3);
    expect(e!.x1).toBeLessThanOrEqual(EDIFICIO.x1 + 2);
  });

  it('`medir` da el pie del edificio: la mediana del borde de abajo por columna', () => {
    const m = mascaraDeLaDiferencia(W, H, maestro, placa, region);
    const md = medir(m)!;
    expect(Math.abs(md.pie - (EDIFICIO.y1 - 1))).toBeLessThanOrEqual(2);
    expect(Math.abs(md.centro - (EDIFICIO.x0 + EDIFICIO.x1) / 2)).toBeLessThanOrEqual(2);
    expect(medir({ ancho: W, alto: H, v: new Uint8Array(W * H) })).toBeNull();
  });

  it('el desenfoque conserva lo liso y no se sale del rango', () => {
    const liso = { ancho: 20, alto: 10, v: new Uint8Array(200).fill(77) };
    expect(desenfocar(liso, 4).v.every((x) => x === 77)).toBe(true);
  });
});

/**
 * El pie de un cuadro y el suelo repetible (costura de F2): de cada tramo se
 * pinta lo de encima de su pie, sobre un empedrado propio. Con un cuadro
 * sintético del alto de un tramo: un muro claro y cálido encima y un empedrado
 * de adoquines oscuros con juntas debajo, como los pinta Codex.
 */
describe('el pie y el suelo de la base', () => {
  const AW = 480;
  const AH = 1024;
  const rng = createRng(11);
  /** Adoquines de 40×16 con juntas, de un gris al azar cada uno. */
  const tonos = Array.from({ length: 2000 }, () => 70 + Math.floor(rng.next() * 35));
  const adoquin = (x: number, y: number): [number, number, number] => {
    const fila = Math.floor(y / 16);
    const xx = x + (fila % 2) * 20;
    if (y % 16 === 0 || xx % 40 === 0) return [45, 42, 38];
    const t = tonos[(fila * 31 + Math.floor(xx / 40)) % tonos.length] as number;
    return [t + 4, t, t - 6];
  };
  /** El muro: piedra clara y cálida, con grano. */
  const muro = (): [number, number, number] => {
    const g = Math.floor(rng.next() * 30);
    return [170 + g, 150 + g, 120 + g];
  };
  /** El pie de verdad: 700, y 730 donde un edificio sale hacia delante (columnas 150-250). */
  const pieDeVerdad = (x: number): number => (x >= 150 && x < 250 ? 730 : 700);
  /** Una puerta de madera oscura sobre el pie que se parece al empedrado (columnas 330-370). */
  const enLaPuerta = (x: number, y: number): boolean => x >= 330 && x < 370 && y >= 610 && y < 700;
  const rgb = new Uint8Array(AW * AH * 3);
  for (let y = 0; y < AH; y++)
    for (let x = 0; x < AW; x++)
      rgb.set(y >= pieDeVerdad(x) || enLaPuerta(x, y) ? adoquin(x, y) : muro(), (y * AW + x) * 3);
  const linea = lineaDelPie(AW, AH, rgb);

  it('el pie nunca sube por encima del de verdad, tampoco donde el zócalo se parece al empedrado', () => {
    for (let x = 0; x < AW; x++) {
      expect(linea[x], `columna ${x}`).toBeGreaterThanOrEqual(pieDeVerdad(x) - 4);
      expect(linea[x], `columna ${x}`).toBeLessThanOrEqual(740);
    }
  });

  it('sigue al edificio que sale hacia delante, y lejos de él vuelve al muro', () => {
    for (let x = 160; x < 240; x++) expect(linea[x], `columna ${x}`).toBeGreaterThanOrEqual(726);
    // A más de lo que abarca el máximo (64) y la mediana (15), el pie del muro.
    for (const x of [20, 60, 450]) expect(linea[x], `columna ${x}`).toBeLessThanOrEqual(712);
  });

  it('con las puertas medidas, el pie se busca junto a ellas: un muro gris que se parece al empedrado no lo sube', () => {
    // T5 de F3: detrás de la plaza, un muro bajo de piedra gris (filas 580-700)
    // algo más claro que el empedrado, y encima lo cálido. Sin las puertas, el
    // cambio fuerte es el de lo alto del muro y el pie salía ahí, 120 px arriba.
    const gris = new Uint8Array(AW * AH * 3);
    for (let y = 0; y < AH; y++)
      for (let x = 0; x < AW; x++)
        gris.set(
          y >= 700
            ? adoquin(x, y)
            : y >= 580
              ? (adoquin(x * 0.7, y * 0.6).map((c) => c + 22) as [number, number, number])
              : muro(),
          (y * AW + x) * 3,
        );
    const sinPuertas = lineaDelPie(AW, AH, gris);
    const conPuertas = lineaDelPie(AW, AH, gris, 700);
    expect(Math.min(...sinPuertas), 'sin las puertas, el pie sube al muro').toBeLessThan(650);
    for (let x = 0; x < AW; x++) {
      expect(conPuertas[x], `columna ${x}`).toBeGreaterThanOrEqual(696);
      expect(conPuertas[x], `columna ${x}`).toBeLessThanOrEqual(740);
    }
  });

  it('la máscara del pie: entera hasta él, fundida debajo y nada pasado el fundido', () => {
    const m = mascaraDelPie(3, 60, [10, 20, 30]);
    expect(m.v[10 * 3]).toBe(255);
    expect(m.v[(10 + FUNDIDO_DEL_PIE / 2) * 3]).toBeGreaterThan(100);
    expect(m.v[(10 + FUNDIDO_DEL_PIE / 2) * 3]).toBeLessThan(155);
    expect(m.v[(10 + FUNDIDO_DEL_PIE) * 3]).toBe(0);
    expect(m.v[30 * 3 + 2]).toBe(255);
  });

  it('el suelo se repite sin junta: la vuelta se parece a dos columnas (filas) vecinas de dentro', () => {
    const W0 = 300;
    const H0 = 200;
    const trozo = new Uint8Array(W0 * H0 * 3);
    for (let y = 0; y < H0; y++)
      for (let x = 0; x < W0; x++)
        trozo.set(adoquin(x * 1.37, y * 1.11).map(Math.round), (y * W0 + x) * 3);
    const s = sueloRepetible({ ancho: W0, alto: H0, v: trozo }, 40, 30);
    expect([s.ancho, s.alto]).toEqual([W0 - 40, H0 - 30]);
    const px = (x: number, y: number): number => s.v[(y * s.ancho + x) * 3] as number;
    const entreColumnas = (a: number, b: number): number => {
      let d = 0;
      for (let y = 0; y < s.alto; y++) d += Math.abs(px(a, y) - px(b, y));
      return d / s.alto;
    };
    const entreFilas = (a: number, b: number): number => {
      let d = 0;
      for (let x = 0; x < s.ancho; x++) d += Math.abs(px(x, a) - px(x, b));
      return d / s.ancho;
    };
    let dentroX = 0;
    for (let x = 1; x < s.ancho; x++) dentroX += entreColumnas(x - 1, x);
    let dentroY = 0;
    for (let y = 1; y < s.alto; y++) dentroY += entreFilas(y - 1, y);
    expect(entreColumnas(s.ancho - 1, 0)).toBeLessThanOrEqual(1.5 * (dentroX / (s.ancho - 1)));
    expect(entreFilas(s.alto - 1, 0)).toBeLessThanOrEqual(1.5 * (dentroY / (s.alto - 1)));
    expect(() =>
      sueloRepetible({ ancho: 60, alto: 40, v: new Uint8Array(60 * 40 * 3) }, 40, 30),
    ).toThrow(/no da para un suelo/);
  });
});
