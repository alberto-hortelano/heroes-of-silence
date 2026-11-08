/**
 * El héroe anda su marcha por el mapa (06-11-2026, petición del usuario: «el
 * personaje se teletransporta a donde va, tiene que verse la animación del héroe
 * caminando por el mapa hasta llegar a su destino»).
 *
 * Lo que se mira: por dónde va a cada instante (`enLaMarcha`, la cuenta que lee la
 * escena del mapa) y que la sesión enseñe la marcha antes de abrir lo que abre la
 * llegada —aquí, la batalla contra un monstruo—, con un clic que la hace llegar.
 * Lo que se ve, con capturas del navegador.
 */
import { describe, expect, it } from 'vitest';
import type { Par } from '../src/client/render/escenario/recinto/octogono.js';
import { trazaPorLosArcos } from '../src/client/render/escenario/recinto/sendas.js';
import { enLaMarcha } from '../src/client/render/figuras/marcha.js';
import { Session } from '../src/client/sesion/partida.js';
import { PUERTAS_DE_LA_CIUDAD } from '../src/core/map/recinto.js';
import { caminoHasta } from '../src/core/state/marcha.js';
import { sesionAntesDelMonstruo } from './batalla-de-cliente.js';
import { partidaDe } from './escena-de-prueba.js';

describe('enLaMarcha: por dónde va quien anda', () => {
  const pasos = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 2, y: 1 },
  ];

  it('recorre cada paso a su compás, el de diagonal √2 veces más largo, y llega', () => {
    expect(enLaMarcha(pasos, 100, 0)).toEqual({ tramo: 0, t: 0, x: 0, y: 0, mira: 'E' });
    expect(enLaMarcha(pasos, 100, 50)?.x).toBeCloseTo(0.5);
    const diagonal = enLaMarcha(pasos, 100, 100 + 100 * Math.SQRT1_2);
    expect(diagonal?.tramo).toBe(1);
    expect(diagonal?.t).toBeCloseTo(0.5);
    expect(diagonal?.x).toBeCloseTo(1.5);
    expect(diagonal?.y).toBeCloseTo(0.5);
    // Hacia abajo y a la derecha en pantalla: al sureste, sin espejo.
    expect(diagonal?.mira).toBe('SE');
    expect(enLaMarcha(pasos, 100, 100 + 100 * Math.SQRT2 + 1)).toBeNull();
  });

  it('sin pasos que andar ya ha llegado, y un compás que no anda lanza', () => {
    expect(enLaMarcha([{ x: 3, y: 3 }], 100, 0)).toBeNull();
    expect(() => enLaMarcha(pasos, 0, 0)).toThrow(/no anda/);
  });
});

describe('la sesión enseña la marcha antes de abrir la llegada', () => {
  it('la batalla del monstruo espera a que el héroe llegue, por las casillas que anduvo', () => {
    const { s, at } = sesionAntesDelMonstruo();
    s.enseñarLaMarcha = true;
    const heroe = s.selectedHero;
    if (heroe === null) throw new Error('sin héroe');
    const salida = heroe.at;
    s.clickTile(at);
    const marcha = s.marchaEnCurso;
    // El núcleo ya ha jugado: la batalla está abierta y el héroe, ante el monstruo.
    expect(s.state.pendingBattle).not.toBeNull();
    // El monstruo de `sesionAntesDelMonstruo` está a más de un paso: hay marcha.
    if (marcha === null) throw new Error(`el héroe no anduvo hasta (${at.x},${at.y})`);
    expect(s.scene).toBe('adventure');
    expect(marcha.heroe).toBe(heroe.id);
    expect(marcha.pasos[0]).toEqual(salida);
    expect(marcha.pasos.at(-1)).toEqual(heroe.at);
    for (let i = 1; i < marcha.pasos.length; i++) {
      const a = marcha.pasos[i - 1]!;
      const b = marcha.pasos[i]!;
      expect(Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y))).toBe(1);
    }
    // Un clic mientras anda solo lo hace llegar: se abre la batalla.
    s.clickTile(at);
    expect(s.marchaEnCurso).toBeNull();
    expect(s.scene).toBe('battle');
  });

  it('mientras anda se ve lo de antes —el movimiento, los objetos— y la niebla va con él', () => {
    const { s, at } = sesionAntesDelMonstruo();
    s.enseñarLaMarcha = true;
    const heroe = s.selectedHero;
    if (heroe === null) throw new Error('sin héroe');
    const movimiento = heroe.movePoints;
    const explorado = s.explorado?.indices();
    const objetos = JSON.stringify(s.objetosConocidos());
    s.clickTile(at);
    const m = s.marchaEnCurso;
    if (m === null) throw new Error('no anduvo');
    // El núcleo ya lo ha movido; el panel y el mapa, aún no.
    expect(heroe.movePoints).toBeLessThan(movimiento);
    expect(s.movimientoALaVista(heroe)).toBe(movimiento);
    expect(s.explorado?.indices()).toEqual(explorado);
    expect(JSON.stringify(s.objetosConocidos())).toBe(objetos);
    expect(s.heroesALaVista().find((h) => h.id === heroe.id)?.at).toEqual(m.pasos[0]);
    // Al pisar la última casilla, la niebla es la que deja el núcleo al llegar.
    s.pisarEnLaMarcha(m.pasos.length - 1);
    expect(s.heroesALaVista().find((h) => h.id === heroe.id)?.at).toEqual(m.pasos.at(-1));
    const alPisarLaUltima = s.explorado?.indices();
    s.acabarLaMarcha();
    expect(s.movimientoALaVista(heroe)).toBe(heroe.movePoints);
    expect(s.explorado?.indices()).toEqual(alPisarLaUltima);
  });

  it('en s1, de la base a (13,9), la región nueva se descubre al pisarla, no al salir', () => {
    const s = new Session(1);
    s.enseñarLaMarcha = true;
    const antes = s.explorado?.size ?? 0;
    s.clickTile({ x: 13, y: 9 });
    const m = s.marchaEnCurso;
    if (m === null) throw new Error('no anduvo');
    expect(s.explorado?.size).toBe(antes);
    const tamaños = m.pasos.map((_, i) => {
      s.pisarEnLaMarcha(i);
      return s.explorado?.size ?? 0;
    });
    s.acabarLaMarcha();
    const despues = s.explorado?.size ?? 0;
    // Algo descubre por el camino, poco a poco, y al llegar es lo del núcleo.
    expect(despues).toBeGreaterThan(antes);
    expect(tamaños.at(-1)).toBe(despues);
    expect(tamaños.every((t, i) => i === 0 || t >= (tamaños[i - 1] ?? 0))).toBe(true);
  });
});

/** Lo que el punto `p` queda del tramo `a → b`. */
function aDelTramo(p: Par, a: Par, b: Par): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/**
 * Lo que la traza de quien entra o sale de un recinto queda, como poco, de las
 * torres de sus vértices, salvo donde acaba en una casilla que ya está más cerca
 * (el acceso de detrás de la torre del noreste, a 0,45, con `AL_LLEGAR`). Con la recta de la
 * casilla de la puerta al acceso, 0,39 a media marcha (el héroe pasaba por la
 * torre de la esquina, QA de la marcha del 06-11-2026, s1); por el arco, 0,6 o más.
 */
const LEJOS_DE_LAS_TORRES = 0.55;
/** Lo que el tramo puede arrimarse a una torre más que la casilla en que acaba: la del este del acceso del noreste, 0,51 frente a 0,53. */
const AL_LLEGAR = 0.05;

describe('la traza sale y entra en un recinto por el arco de su puerta (trazaPorLosArcos)', () => {
  it('en s1, de la ciudad del héroe a (0,12): por el arco del sureste, dentro, arco y fuera', () => {
    const s = new Session(1);
    const heroe = s.selectedHero;
    if (heroe === null) throw new Error('sin héroe');
    const camino = caminoHasta(s.state, heroe, { x: 0, y: 12 });
    if (camino === null) throw new Error('sin camino');
    const casillas = [heroe.at, ...camino.map((p) => p.at)];
    const { escena } = partidaDe(1);
    const recinto = escena.recintos.find(
      (r) => r.rect.i0 + 1 === heroe.at.x && r.rect.j0 + 1 === heroe.at.y,
    );
    if (recinto === undefined) throw new Error('el héroe no sale de una ciudad');
    const arco = recinto.porElArco.find((a) => a.cara === 'se');
    if (arco === undefined) throw new Error('la ciudad de s1 no tiene puerta al sureste');
    const traza = trazaPorLosArcos(escena.recintos, casillas);
    // La casilla de la puerta (la 1) es su paso por el arco; las demás, su pie.
    expect(traza.filter((p) => p.paso === 1).map((p) => p.en)).toEqual([
      arco.dentro,
      arco.arco,
      arco.fuera,
    ]);
    expect(traza.filter((p) => p.paso !== 1).every((p) => p.en === null)).toBe(true);
    // Y al revés, de vuelta a la ciudad, lo mismo del revés.
    const vuelta = trazaPorLosArcos(escena.recintos, [...casillas].reverse());
    const n = casillas.length - 2;
    expect(vuelta.filter((p) => p.paso === n).map((p) => p.en)).toEqual([
      arco.fuera,
      arco.arco,
      arco.dentro,
    ]);
  });

  it('de la ciudad a cada acceso de cada puerta y de vuelta, lejos de las torres (s1-s6)', () => {
    let malos = 0;
    for (let semilla = 1; semilla <= 6; semilla++) {
      for (const r of partidaDe(semilla).escena.recintos) {
        const c = { x: r.rect.i0 + 1, y: r.rect.j0 + 1 };
        for (const arco of r.porElArco) {
          if (arco.cara === 'e' || arco.cara === 'o') continue;
          const { casilla, accesos } = PUERTAS_DE_LA_CIUDAD[arco.cara];
          const puerta = { x: c.x + casilla[0], y: c.y + casilla[1] };
          for (const [ax, ay] of accesos) {
            const ida = [c, puerta, { x: c.x + ax, y: c.y + ay }];
            // Con el pie de la línea (el centro) y con el del héroe.
            for (const casillas of [ida, [...ida].reverse()])
              for (const pies of [0.5, 0.8]) {
                const traza = trazaPorLosArcos([r], casillas);
                const puntos = traza.map(
                  ({ en, paso }): Par =>
                    en ?? [(casillas[paso]?.x ?? 0) + 0.5, (casillas[paso]?.y ?? 0) + pies],
                );
                for (const v of r.contorno.vertices)
                  for (let i = 1; i < puntos.length; i++) {
                    const a = puntos[i - 1] as Par;
                    const b = puntos[i] as Par;
                    // Lo que exige: lo que pide a todo, o lo que queda la casilla en
                    // que acaba, menos lo que se arrima al llegar a ella.
                    const exige = Math.min(
                      LEJOS_DE_LAS_TORRES,
                      ...[i - 1, i]
                        .filter((k) => traza[k]?.en === null)
                        .map(
                          (k) =>
                            Math.hypot(v[0] - (puntos[k] as Par)[0], v[1] - (puntos[k] as Par)[1]) -
                            AL_LLEGAR,
                        ),
                    );
                    if (aDelTramo(v, a, b) < exige) malos++;
                  }
              }
          }
        }
      }
    }
    expect(malos).toBe(0);
  });
});
