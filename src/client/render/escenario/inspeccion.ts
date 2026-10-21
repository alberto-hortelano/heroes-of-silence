/**
 * Qué hay en un punto del escenario: lo que una marca de fallo guarda para que
 * quien arregle el escenógrafo sepa qué módulo, qué cara o qué puente mira sin
 * tener que adivinarlo en el recorte.
 *
 * Pura —ni lienzo ni DOM—: lee el `Escenario` que ya se compuso para pintar,
 * así que dice lo que se pintó y no lo que saldría de componer otra vez.
 */
import type { CaraAhi, QueHay, SpriteAhi } from '../../desarrollo/tipos.js';
import { columnasDeCara } from './caras.js';
import { type Catalogo, esHojaDeLadera } from './catalogo.js';
import { type Caja, cajaDeSprite } from './pasillo.js';
import { puenteEnElTerreno } from './puentes.js';
import { bandaDeCara, type CaraDeEscena } from './relieve.js';
import type { Escenario } from './superficie.js';

/** De qué hoja y módulo, o de qué pieza suelta, sale una `src` del catálogo. */
type Origen = { hoja: string | null; modulo: string | null; pieza: string | null };

/** El índice de cada catálogo, hecho una vez: el escenario es el mismo toda la partida. */
const indices = new WeakMap<Catalogo, ReadonlyMap<string, Origen>>();

function origenesDe(c: Catalogo): ReadonlyMap<string, Origen> {
  const hecho = indices.get(c);
  if (hecho !== undefined) return hecho;
  const indice = new Map<string, Origen>();
  for (const [hoja, modulos] of Object.entries(c.hojas))
    for (const m of modulos) indice.set(m.src, { hoja, modulo: m.nombre, pieza: null });
  for (const [pieza, p] of Object.entries(c.piezas))
    if (!indice.has(p.src)) indice.set(p.src, { hoja: null, modulo: null, pieza });
  indices.set(c, indice);
  return indice;
}

/** Los tramos en x de una cara que no se pintan (`CaraDeEscena.pintada`, los `null`), como `[a, b]`. */
function tramosSinPintar(c: CaraDeEscena): [number, number][] {
  const xs = columnasDeCara(c);
  const fuera: [number, number][] = [];
  for (const [i, t] of c.pintada.entries()) {
    if (t !== null) continue;
    const x = xs[i] as number;
    const u = fuera.at(-1);
    if (u !== undefined && c.pintada[i - 1] === null) u[1] = x;
    else fuera.push([x, x]);
  }
  return fuera;
}

const corta = (a: Caja, b: Caja): boolean =>
  a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
const contiene = (a: Caja, x: number, y: number): boolean =>
  a[0] <= x && x <= a[2] && a[1] <= y && y <= a[3];

/**
 * Lo que hay en `punto` (casillas con decimales) y en `casilla`: los sprites
 * cuya caja contiene el punto o corta la casilla, en el orden de la escena; el
 * suelo, el terreno y el nivel de la casilla; las caras cuya banda la corta,
 * las paredes del relieve cuya celda la corta y las bajadas que arrancan en
 * ella (R4/R5), y el puente que se pulsaría ahí o el de su nodo.
 *
 * Lanza si la casilla cae fuera del mapa: una marca fuera no señala nada.
 */
export function queHayEn(
  esc: Escenario,
  punto: { readonly x: number; readonly y: number },
  casilla: { readonly x: number; readonly y: number },
): QueHay {
  const { escena } = esc;
  const { W, H } = escena;
  if (
    !Number.isInteger(casilla.x) ||
    !Number.isInteger(casilla.y) ||
    casilla.x < 0 ||
    casilla.y < 0 ||
    casilla.x >= W ||
    casilla.y >= H
  )
    throw new Error(
      `la casilla (${casilla.x}, ${casilla.y}) cae fuera del mapa de ${W}×${H}: ahí no hay nada que marcar`,
    );
  const i = casilla.y * W + casilla.x;
  const cuadro: Caja = [casilla.x, casilla.y, casilla.x + 1, casilla.y + 1];
  const indice = origenesDe(esc.catalogo);

  const sprites: SpriteAhi[] = [];
  for (const s of escena.sprites) {
    const caja = cajaDeSprite(s);
    const cubrePunto = contiene(caja, punto.x, punto.y);
    if (!cubrePunto && !corta(caja, cuadro)) continue;
    const de = s.src === null ? undefined : indice.get(s.src);
    sprites.push({
      clase: s.clase,
      src: s.src,
      hoja: de?.hoja ?? null,
      modulo: de?.modulo ?? null,
      pieza: de?.pieza ?? null,
      ladera: de?.hoja != null && esHojaDeLadera(de.hoja),
      recorte: s.recorte ?? null,
      caja,
      ancla: [s.x, s.y],
      alto: s.alto,
      tono: s.tono ?? null,
      capa: s.capa,
      objeto: s.objeto === undefined ? null : { id: s.objeto.id, kind: s.objeto.kind },
      cubrePunto,
    });
  }

  const caras: CaraAhi[] = [];
  for (const c of escena.relieve.caras) {
    const banda = bandaDeCara(c);
    if (!corta(banda, cuadro) && !contiene(banda, punto.x, punto.y)) continue;
    caras.push({
      y: c.y,
      x0: c.x0,
      x1: c.x1,
      caida: c.caida,
      material: c.material,
      banda,
      abierto: tramosSinPintar(c),
    });
  }

  // La celda de un vértice es el cuadrado de una casilla centrado en él.
  const celdas = escena.relieve.celdas
    .filter((c) => corta([c.vx - 0.5, c.vy - 0.5, c.vx + 0.5, c.vy + 0.5], cuadro))
    .map(({ vx, vy, tipo, caida, material }) => ({ vx, vy, tipo, caida, material }));
  const bajadas = escena.relieve.bajadas
    .filter((b) => contiene(cuadro, b.arriba[0], b.arriba[1]))
    .map(({ rumbo, caida, material, arriba }) => ({
      rumbo,
      caida,
      material,
      arriba: [arriba[0], arriba[1]] as const,
    }));

  // El puente que se pulsaría en el punto (como `casillaBajo`), o si no, el
  // del nodo de esta casilla: un tablero alzado no cae encima de su nodo.
  const bajo =
    puenteEnElTerreno(escena.puentes, esc.terreno, W, punto.x, punto.y) ??
    escena.puentes.find(
      (p) => Math.floor(p.nodo[0]) === casilla.x && Math.floor(p.nodo[1]) === casilla.y,
    ) ??
    null;

  const terreno = esc.terreno[i];
  const suelo = escena.suelo[i];
  const nivel = escena.nivel[i];
  if (terreno === undefined || suelo === undefined || nivel === undefined)
    throw new Error(
      `la escena no tiene la casilla (${casilla.x}, ${casilla.y}) aunque mide ${W}×${H}: el terreno y la escena no son del mismo mapa`,
    );
  return {
    terreno,
    suelo,
    nivel,
    agua: escena.agua.includes(i),
    sprites,
    caras,
    celdas,
    bajadas,
    puente:
      bajo === null
        ? null
        : {
            id: bajo.id,
            pieza: bajo.pieza,
            eje: bajo.eje,
            clase: bajo.clase,
            nodo: [bajo.nodo[0], bajo.nodo[1]],
            escala: bajo.escala,
          },
    spritesDeLaEscena: escena.sprites.length,
  };
}
