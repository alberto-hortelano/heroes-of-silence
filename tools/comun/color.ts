/**
 * Color de las herramientas: sRGB de 8 bits, OKLab y contraste WCAG. Lo leen la paleta de los
 * temas (`taller/temas/paleta.ts`, que mide las láminas), sus tests (`temas`,
 * `paleta-de-las-laminas`) y el contraste de los rótulos de `qa/navegador/temas-con-piezas.ts`.
 */

export type Rgb = readonly [number, number, number];

export function hex(c: Rgb): string {
  return `#${c
    .map((v) =>
      Math.round(Math.min(255, Math.max(0, v)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

export function deHex(color: string): Rgb {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color);
  if (m === null) throw new Error(`"${color}" no es un color opaco #rgb o #rrggbb`);
  const h =
    (m[1] as string).length === 3
      ? [...(m[1] as string)].map((c) => c + c).join('')
      : (m[1] as string);
  return [0, 2, 4].map((i) => Number.parseInt(h.slice(i, i + 2), 16)) as unknown as Rgb;
}

export const lineal = (v: number): number => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const gamma = (c: number): number =>
  255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

export function aOklab(c: Rgb): [number, number, number] {
  const [r, g, b] = c.map(lineal) as [number, number, number];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

export function deOklab([L, a, b]: readonly [number, number, number]): Rgb {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    gamma(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    gamma(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    gamma(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

/** Distancia en OKLab: 0,02 apenas se ve al lado; 0,1 ya es otro color. */
export function deltaE(x: string, y: string): number {
  const [a, b] = [aOklab(deHex(x)), aOklab(deHex(y))];
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/**
 * Un color con transparencia (`#rrggbbaa`) puesto sobre otro opaco, como lo ve
 * quien mira: la barra de abajo del neutro (`#26362ef5`) deja ver la página.
 * Un color opaco sale tal cual.
 */
export function sobre(color: string, debajo: string): string {
  const m = /^#([0-9a-f]{6})([0-9a-f]{2})$/i.exec(color);
  if (m === null) return hex(deHex(color));
  const alfa = Number.parseInt(m[2] as string, 16) / 255;
  const [arriba, abajo] = [deHex(`#${m[1]}`), deHex(debajo)];
  return hex(
    [0, 1, 2].map(
      (i) => (arriba[i] as number) * alfa + (abajo[i] as number) * (1 - alfa),
    ) as unknown as Rgb,
  );
}

export function luminancia(c: Rgb): number {
  const [r, g, b] = c.map(lineal) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** El contraste WCAG de dos luminancias relativas (de 0 a 1), en cualquier orden. */
export const contrasteDeLuces = (la: number, lb: number): number =>
  (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);

export function contraste(x: string, y: string): number {
  return contrasteDeLuces(luminancia(deHex(x)), luminancia(deHex(y)));
}
