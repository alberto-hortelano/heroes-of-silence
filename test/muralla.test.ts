/**
 * La muralla (#183, #197): una línea de frontera de puerta y apoyo a puerta y
 * apoyo, torres en cada esquina y en lo recto, y el guardia que cuenta lo
 * PINTADO (`murallaSinLeer`), no la línea. La auditoría 3 midió el 66 % de las
 * casillas de muro sin una pieza cerca y 6 de 15 puertas solas en el llano con
 * `murallasPartidas` a 0 (#183); con el esqueleto de la franja, la muralla
 * sacaba espolones a la nieve y dejaba juntas abiertas (s1 (13-16, 2-6), #197).
 */
import { describe, expect, it } from 'vitest';
import { analizar } from '../src/client/render/escenario/analizar.js';
import { alrededorDeMurallas, sendaParaLaMuralla } from '../src/client/render/escenario/colocar.js';
import { ejeDe, type Paso } from '../src/client/render/escenario/esqueleto.js';
import {
  type Alrededor,
  apiladas,
  CIUDAD,
  ENTRE_TORRES,
  esquinasDe,
  murallaSinLeer,
  murallaSobreLaSenda,
  type PuertaDeLinea,
  seApilan,
  type TramoPintado,
  torresDe,
  trazaDeMuralla,
} from '../src/client/render/escenario/muralla.js';
import { escenaDe, partidaDe } from './helpers.js';
import { rango, segunPrisa } from './lento.js';

type Casilla = readonly [number, number];

const clave = ([x, y]: Casilla) => `${x},${y}`;

/**
 * Un trozo de mapa dibujado: `#` muro, `a` `b` `c` lo que se pisa de cada lado,
 * `X` otra barrera y `P` una puerta (con `paso`, hacia dónde se cruza). Fuera
 * del dibujo es el borde del mapa. `huella`, las casillas que tapa una ciudad.
 */
function mundo(
  filas: readonly string[],
  paso: Casilla = [0, 1],
  huella: readonly Casilla[] = [],
): { muro: Casilla[]; puertas: PuertaDeLinea[]; alrededor: Alrededor } {
  const muro: Casilla[] = [];
  const puertas: PuertaDeLinea[] = [];
  filas.forEach((f, y) => {
    [...f].forEach((ch, x) => {
      if (ch === '#') muro.push([x, y]);
      if (ch === 'P') puertas.push({ at: [x, y], paso });
    });
  });
  const en = (x: number, y: number) => filas[y]?.[x];
  const bajo = new Set(huella.map(clave));
  const alrededor: Alrededor = {
    apoyos: (x, y) => {
      const cosas = new Set<string>();
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const ch = en(x + dx, y + dy);
          if (ch === undefined) cosas.add('borde');
          if (ch === 'X') cosas.add('franja:X');
          if (bajo.has(clave([x + dx, y + dy]))) cosas.add(`${CIUDAD}0`);
        }
      return [...cosas];
    },
    lado: (x, y) => 'abc'.indexOf(en(x, y) ?? '.'),
    bajoCiudad: (x, y) => (bajo.has(clave([x, y])) ? [`${CIUDAD}0`] : []),
    nivel: () => 0,
  };
  return { muro, puertas, alrededor };
}

/** Lo que se pintaría de una línea: sus tramos y una torre en cada casilla de `torres`. */
const pintado = (pasos: readonly Paso[], torres: readonly Casilla[] = []): TramoPintado[] => [
  ...pasos.map((p) => ({ franja: 0, a: p.a, b: p.b })),
  ...torres.map((c) => ({ franja: 0, a: c, b: c })),
];

/** El guardia sobre la línea de un `mundo`, con sus torres. */
function guardia(m: ReturnType<typeof mundo>, pasos: readonly Paso[], torres: readonly Casilla[]) {
  const enMuro = new Set(m.muro.map(clave));
  return murallaSinLeer(
    [{ id: 0, casillas: m.muro }],
    m.puertas.map((p, k) => ({ id: `p${k}`, at: p.at, paso: p.paso })),
    (x, y) => enMuro.has(clave([x, y])),
    pintado(pasos, torres),
    m.alrededor,
  );
}

/** El informe de la muralla sin nada que señalar. */
const NADA = {
  fugas: [],
  puertasSueltas: [],
  huecos: 0,
  espolones: [],
  esquinasAbiertas: [],
  puntasSinTorre: [],
  torresApiladas: [],
};

/** Las puntas de una línea: casillas con un solo paso. */
function puntas(pasos: readonly Paso[]): string[] {
  const grado = new Map<string, number>();
  for (const p of pasos)
    for (const c of [p.a, p.b]) grado.set(clave(c), (grado.get(clave(c)) ?? 0) + 1);
  return [...grado].filter(([, n]) => n === 1).map(([k]) => k);
}

describe('la línea de una muralla (#197)', () => {
  // Una frontera en diagonal entre `a` (arriba) y `b` (abajo), de tres de
  // ancho, del borde de arriba al bosque de abajo, con un bulto hacia `b` en
  // (1,3): la franja de s1 (13-16, 1-6), a escalones y con su bulto.
  const escalera = mundo([
    'X##aaaaaaa',
    'b###aaaaaa',
    'bb###aaaaa',
    'b####aaaaa',
    'bbb###aaaa',
    'bbbb###aaa',
    'bbbbb###aa',
    'bbbbbb###X',
  ]);

  it('en una franja a escalones con un bulto, una tirada recta de apoyo a apoyo, sin espolón', () => {
    const e = trazaDeMuralla(escalera.muro, [], escalera.alrededor);
    // Cada punta se apoya en algo: el borde o el bosque.
    for (const k of puntas(e.pasos)) {
      const [x, y] = k.split(',').map(Number) as [number, number];
      expect(escalera.alrededor.apoyos(x, y), `punta (${k})`).not.toEqual([]);
    }
    // El bulto se queda en escombro: antes, el esqueleto sacaba ahí un espolón.
    expect(e.casillas.map(clave)).not.toContain('1,3');
    // Recta: un solo eje.
    expect(new Set(e.pasos.map(ejeDe))).toEqual(new Set(['diagonal-baja']));
    expect(guardia(escalera, e.pasos, torresDe(e, []))).toEqual(NADA);
  });

  it('pasa por la puerta y sale de ella a los dos lados, de través a su paso', () => {
    const m = mundo(['aaaaaaaaa', 'X###P###X', 'X###b###X', 'bbbbbbbbb']);
    const e = trazaDeMuralla(m.muro, m.puertas, m.alrededor);
    const desdeLaPuerta = e.pasos.filter((q) => clave(q.a) === '4,1' || clave(q.b) === '4,1');
    expect(desdeLaPuerta.map(ejeDe)).toEqual(['horizontal', 'horizontal']);
    const lados = desdeLaPuerta.map((q) => Math.sign((clave(q.a) === '4,1' ? q.b[0] : q.a[0]) - 4));
    expect(new Set(lados)).toEqual(new Set([-1, 1]));
    expect(guardia(m, e.pasos, torresDe(e, [[4, 1]]))).toEqual(NADA);
  });

  it('llega hasta debajo de la ciudad, no a la casilla de al lado (s1 (13,2))', () => {
    // La ciudad tapa (0-2, 0-2), con la primera casilla de muro; la franja va de
    // ella al borde del este. Parada en la casilla de al lado, (3,1), quedaba
    // casilla y media de hueco hasta la pieza de la ciudad.
    const huella: Casilla[] = [0, 1, 2].flatMap((y) => [0, 1, 2].map((x): Casilla => [x, y]));
    const m = mundo(['...aaa', '..####', '...bbb'], [0, 1], huella);
    const e = trazaDeMuralla(m.muro, [], m.alrededor);
    expect(e.casillas.map(clave)).toContain('2,1');
    expect(guardia(m, e.pasos, torresDe(e, []))).toEqual(NADA);
  });

  it('donde la franja tiene un lado alto y otro bajo, va por lo alto y no al pie de la cara (s9 (8-12, 1-6))', () => {
    // Arriba `a` y la fila de muro de arriba a nivel 2; la de abajo y `b`, a 0.
    const m = mundo(['aaaaaaa', '#######', '#######', 'bbbbbbb']);
    const alto = { ...m.alrededor, nivel: (_x: number, y: number) => (y <= 1 ? 2 : 0) };
    const e = trazaDeMuralla(m.muro, [], alto);
    expect(new Set(e.casillas.map((c) => c[1]))).toEqual(new Set([1]));
    // Al revés, por la de abajo.
    const bajo = { ...m.alrededor, nivel: (_x: number, y: number) => (y >= 2 ? 2 : 0) };
    expect(new Set(trazaDeMuralla(m.muro, [], bajo).casillas.map((c) => c[1]))).toEqual(
      new Set([2]),
    );
  });

  it('no dobla donde la torre de la esquina no cabe de ninguna manera', () => {
    // Una frontera en L, de dos de ancho, del borde de arriba al de la derecha.
    const m = mundo(['a##bbbb', 'a##bbbb', 'a######', 'a######', 'aaaaaaa']);
    const libre = trazaDeMuralla(m.muro, [], m.alrededor);
    const esquinas = esquinasDe(libre.pasos).filter((c) => !puntas(libre.pasos).includes(clave(c)));
    expect(esquinas.length).toBeGreaterThan(0);
    const prohibida = clave(esquinas[0] as Casilla);
    const otra = trazaDeMuralla(
      m.muro,
      [],
      m.alrededor,
      () => true,
      (c) => clave(c) !== prohibida,
    );
    const suyas = esquinasDe(otra.pasos).filter((c) => !puntas(otra.pasos).includes(clave(c)));
    expect(suyas.map(clave)).not.toContain(prohibida);
    expect(guardia(m, otra.pasos, torresDe(otra, []))).toEqual(NADA);
  });

  it('una ruina en medio de una región va de punta a punta; un 2×2 deja una torre (s25)', () => {
    const ruina = mundo(['aaaaaa', 'a####a', 'a#aaaa', 'aaaaaa']);
    const e = trazaDeMuralla(ruina.muro, [], ruina.alrededor);
    expect(e.pasos.length).toBeGreaterThan(0);
    // El 2×2 da un tramo de norte a sur, que es un tocón: queda una torre.
    const cuadrado = mundo(['aaaa', 'a##a', 'a##a', 'aaaa']);
    const dos = trazaDeMuralla(cuadrado.muro, [], cuadrado.alrededor);
    expect(dos.pasos).toEqual([]);
    expect(dos.casillas).toHaveLength(1);
  });
});

describe('las torres', () => {
  // Del oeste al este, baja en diagonal y sigue al sur: tres ejes.
  const linea = {
    casillas: [
      [0, 0],
      [1, 0],
      [2, 0],
      [3, 1],
      [3, 2],
      [3, 3],
      [3, 4],
      [3, 5],
      [3, 6],
      [3, 7],
    ] as Casilla[],
    pasos: [
      { a: [0, 0], b: [1, 0] },
      { a: [1, 0], b: [2, 0] },
      { a: [2, 0], b: [3, 1] },
      { a: [3, 1], b: [3, 2] },
      { a: [3, 2], b: [3, 3] },
      { a: [3, 3], b: [3, 4] },
      { a: [3, 4], b: [3, 5] },
      { a: [3, 5], b: [3, 6] },
      { a: [3, 6], b: [3, 7] },
    ] as Paso[],
  };

  it('en cada esquina, también a 45° y aunque otra quede a menos de ENTRE_TORRES (s1 (15,5))', () => {
    const torres = torresDe(linea, []).map(clave);
    for (const c of ['0,0', '2,0', '3,1', '3,7']) expect(torres).toContain(c);
  });

  it('en lo recto, a ENTRE_TORRES como poco unas de otras', () => {
    const torres = torresDe(linea, []);
    const rectas = torres.filter((t) => t[0] === 3 && t[1] > 1 && t[1] < 7);
    expect(rectas.length).toBeGreaterThan(0);
    for (const t of rectas)
      for (const u of torres)
        if (t !== u)
          expect(Math.hypot(t[0] - u[0], t[1] - u[1])).toBeGreaterThanOrEqual(ENTRE_TORRES);
  });

  it('ninguna junto a una puerta, que lleva las suyas', () => {
    const torres = torresDe(linea, [[3, 4]]);
    for (const t of torres)
      expect(Math.max(Math.abs(t[0] - 3), Math.abs(t[1] - 4))).toBeGreaterThan(1);
  });
});

describe('las torres apiladas', () => {
  const torre = (x: number, y: number): TramoPintado => ({ franja: 0, a: [x, y], b: [x, y] });

  it('el guardia cuenta las torres a una casilla o menos de otra, también en diagonal y de otra franja', () => {
    expect(apiladas([torre(0, 0), torre(2, 0), torre(4, 2)])).toEqual([]);
    expect(apiladas([torre(0, 0), torre(1, 1)])).toEqual([[1, 1]]);
    expect(apiladas([torre(0, 0), { ...torre(0, 1), franja: 1 }])).toEqual([[0, 1]]);
    // Un tramo no es una torre.
    expect(apiladas([torre(0, 0), { franja: 0, a: [0, 1], b: [1, 1] }])).toEqual([]);
  });

  it('se apilan a una casilla, o en la misma columna a dos: la cámara las pone una encima de otra (s9 (20,12)-(20,14))', () => {
    expect(seApilan([0, 0], [1, 1])).toBe(true);
    expect(seApilan([0, 0], [0, 2])).toBe(true);
    expect(seApilan([0, 0], [0, 3])).toBe(false);
    expect(seApilan([0, 0], [1, 2])).toBe(false);
    expect(seApilan([0, 0], [2, 0])).toBe(false);
  });

  it('una línea de un tramo de oeste a este lleva una torre, no una en cada punta', () => {
    const corta = {
      casillas: [
        [3, 4],
        [4, 4],
      ] as Casilla[],
      pasos: [{ a: [3, 4], b: [4, 4] }] as Paso[],
    };
    expect(torresDe(corta, [])).toHaveLength(1);
  });

  it('una ruina corta de norte a sur es una torre, no una chimenea ni un raíl (s2 (3,4)-(3,5), s1 (26,31-33))', () => {
    for (const filas of [
      ['aaa', 'a#a', 'a#a', 'aaa'],
      ['aaa', 'a#a', 'a#a', 'a#a', 'aaa'],
    ]) {
      const m = mundo(filas);
      const e = trazaDeMuralla(m.muro, [], m.alrededor);
      expect(e.pasos).toEqual([]);
      expect(torresDe(e, [])).toHaveLength(1);
    }
    // De cuatro, un tramo con una torre en cada punta, a tres.
    const larga = mundo(['aaa', 'a#a', 'a#a', 'a#a', 'a#a', 'aaa']);
    const e = trazaDeMuralla(larga.muro, [], larga.alrededor);
    expect(e.pasos).toHaveLength(3);
    expect(apiladas(pintado(e.pasos, torresDe(e, [])))).toEqual([]);
  });

  it('la punta de norte a sur lleva su torre aunque no quepa: sin ella el tramo es un raíl (s1 (26,31))', () => {
    const recta = {
      casillas: rango(0, 3).map((y): Casilla => [5, y]),
      pasos: rango(0, 2).map((y): Paso => ({ a: [5, y], b: [5, y + 1] })),
    };
    expect(
      torresDe(recta, [], () => false)
        .map(clave)
        .sort(),
    ).toEqual(['5,0', '5,3']);
  });

  it('la punta pegada a una junta se queda sin torre: la de la junta va primero (s2 (30,28))', () => {
    // Va al este, dobla al sureste en (1,0) y sigue: las dos puntas quedan a
    // una casilla de la junta.
    const ele = {
      casillas: [
        [0, 0],
        [1, 0],
        [2, 1],
      ] as Casilla[],
      pasos: [
        { a: [0, 0], b: [1, 0] },
        { a: [1, 0], b: [2, 1] },
      ] as Paso[],
    };
    expect(torresDe(ele, []).map(clave)).toEqual(['1,0']);
  });

  it('el guardia cuenta la punta de norte a sur sin torre, salvo junto a una puerta', () => {
    const m = mundo(['aaa', 'X#X', 'X#X', 'X#X', 'bbb']);
    const pasos: Paso[] = [
      { a: [1, 1], b: [1, 2] },
      { a: [1, 2], b: [1, 3] },
    ];
    expect(guardia(m, pasos, []).puntasSinTorre.map(clave).sort()).toEqual(['1,1', '1,3']);
    expect(
      guardia(m, pasos, [
        [1, 1],
        [1, 3],
      ]).puntasSinTorre,
    ).toEqual([]);
  });

  it('la casilla sola junto a la junta de otra muralla se queda sin torre (s18 (12,23))', () => {
    const sola = trazaDeMuralla([[4, 4]], [], mundo(['a']).alrededor);
    expect(
      torresDe(
        sola,
        [],
        () => true,
        () => false,
        [[5, 5]],
      ),
    ).toEqual([]);
    expect(
      torresDe(
        sola,
        [],
        () => true,
        () => false,
        [[6, 6]],
      ).map(clave),
    ).toEqual(['4,4']);
  });
});

describe('la muralla y la senda (#193)', () => {
  // Una línea de oeste a este, de (0,1) a (8,1): las torres van en sus puntas y
  // cada ENTRE_TORRES en lo recto.
  const recta = {
    casillas: rango(0, 8).map((x): Casilla => [x, 1]),
    pasos: rango(0, 7).map((x): Paso => ({ a: [x, 1], b: [x + 1, 1] })),
  };

  it('una torre que no cabe no se pone, y la siguiente candidata ocupa su sitio', () => {
    expect(torresDe(recta, []).map(clave)).toContain('0,1');
    // La punta del oeste tapa la senda: sin ella, la primera torre del oeste es otra.
    const sinPunta = torresDe(recta, [], (c) => clave(c) !== '0,1');
    expect(sinPunta.map(clave)).not.toContain('0,1');
    expect(sinPunta.some((t) => t[0] <= ENTRE_TORRES)).toBe(true);
  });

  it('la casilla sin tramos lleva su torre aunque no quepa: es toda la muralla', () => {
    const sola = trazaDeMuralla([[4, 4]], [], mundo(['a']).alrededor);
    expect(sola.pasos).toEqual([]);
    expect(torresDe(sola, [], () => false).map(clave)).toEqual(['4,4']);
  });

  it('la esquina lleva su torre aunque no quepa entera: sin ella la junta se abre (s17 (10,31))', () => {
    // La segunda pata en diagonal: una punta de norte a sur llevaría la suya.
    const ele = {
      casillas: [
        [0, 0],
        [1, 0],
        [2, 1],
      ] as Casilla[],
      pasos: [
        { a: [0, 0], b: [1, 0] },
        { a: [1, 0], b: [2, 1] },
      ] as Paso[],
    };
    expect(torresDe(ele, [], () => false).map(clave)).toEqual(['1,0']);
  });

  describe('el guardia (murallaSobreLaSenda)', () => {
    const linea: TramoPintado[] = [0, 1, 2, 3].map((x) => ({
      franja: 0,
      a: [x, 0],
      b: [x + 1, 0],
    }));
    const torre: TramoPintado = { franja: 0, a: [0, 0], b: [0, 0] };
    const lejos = () => false;

    it('sin senda cerca y sin torre que tape: nada', () => {
      expect(murallaSobreLaSenda([...linea, torre], [], () => false, lejos)).toEqual([]);
    });

    it('cuenta la torre que tapa la senda', () => {
      expect(murallaSobreLaSenda([...linea, torre], [], () => true, lejos)).toEqual([[0, 0]]);
    });

    it('cuenta el tramo que la senda cruza fuera de una puerta, y no el que llega a ella', () => {
      // Una senda de norte a sur por x = 3: cruza el tramo de (2,0) a (3,0), de
      // centro (2,5) a centro (3,5), por su medio.
      const cruza = (x: number) => Math.abs(x - 3) < 0.1;
      expect(murallaSobreLaSenda(linea, [], () => false, cruza)).toEqual([[2, 0]]);
      // Con la puerta en (2,0), la senda pasa por ella: es lo que la muralla espera.
      expect(murallaSobreLaSenda(linea, [[2, 0]], () => false, cruza)).toEqual([]);
    });
  });
});

describe('el guardia cuenta lo pintado', () => {
  // Una muralla de oeste a este, de borde a borde, con una puerta en (3,2) y el
  // muro a sus dos lados; arriba `a`, abajo `b`, y un muro de más en (5,1).
  const m = mundo(['aaaaaaa', 'aaaaa#a', '###P###', 'bbbbbbb']);
  const linea: Paso[] = [0, 1, 2, 3, 4, 5].map((x) => ({ a: [x, 2], b: [x + 1, 2] }));
  const torres: Casilla[] = [
    [0, 2],
    [6, 2],
  ];

  it('la muralla entera, con la puerta unida a los dos lados: nada', () => {
    expect(guardia(m, linea, torres)).toEqual(NADA);
  });

  it('un tramo que no entró parte la línea, y por el hueco se pasa de un lado al otro', () => {
    const g = guardia(
      m,
      linea.filter((t) => t.a[0] !== 4),
      torres,
    );
    expect(g.huecos).toBe(1);
    expect(g.fugas.length).toBeGreaterThan(0);
  });

  it('sin el tramo de un lado, la puerta está suelta', () => {
    expect(
      guardia(
        m,
        linea.filter((t) => t.b[0] !== 3),
        torres,
      ).puertasSueltas,
    ).toEqual(['p0']);
  });

  it('una línea que se queda a una casilla del borde no cierra, y su punta es un espolón', () => {
    const g = guardia(m, linea.slice(1), [
      [1, 2],
      [6, 2],
    ]);
    expect(g.fugas.length).toBeGreaterThan(0);
    expect(g.espolones.map(clave)).toEqual(['1,2']);
  });

  it('un tramo que sale de la línea y no llega a nada es un espolón, y su junta sin torre se ve abierta', () => {
    const conRama = [...linea, { a: [5, 1], b: [5, 2] } as Paso];
    const g = guardia(m, conRama, torres);
    expect(g.espolones.map(clave)).toEqual(['5,1']);
    expect(g.esquinasAbiertas.map(clave)).toEqual(['5,2']);
    expect(g.fugas).toEqual([]);
    // Con la torre en la junta, solo queda el espolón.
    expect(guardia(m, conRama, [...torres, [5, 2]]).esquinasAbiertas).toEqual([]);
  });

  it('una junta junto a la puerta no cuenta: la tapa la puerta', () => {
    const junto = mundo(['aaaaaa', 'a#aaaa', '##P###', 'bbbbbb']);
    const pasos: Paso[] = [
      { a: [0, 2], b: [1, 2] },
      { a: [1, 1], b: [1, 2] },
      { a: [1, 2], b: [2, 2] },
    ];
    expect(guardia(junto, pasos, []).esquinasAbiertas).toEqual([]);
  });

  it('sin nada pintado, los dos lados se juntan', () => {
    expect(guardia(m, [], []).fugas.length).toBeGreaterThan(0);
  });
});

describe('en las partidas', () => {
  // 1: s1 (13-16, 2-6), la marca del usuario; 8: una punta de norte a sur
  // junto a una junta (auditoría 4); 2: el 2×2 de (14,19) y dos
  // apoyos pegados bajo una ciudad (22-24, 27-28); 9: una franja con un lado
  // alto y otro bajo; 31 y 33: casillas sueltas que solo caben encogidas
  // (#193); 58 y 103: un dedo de un lado en la franja; 86: una orilla que toca
  // tres lados; 270: una franja que acaba contra un acantilado de un solo lado
  // (#197); 443: una puerta en la columna 0 tomada por la de la franja del borde
  // contrario; 699: una franja que acaba en el nodo de un acantilado; 730: un
  // paso en diagonal que dejaba un trozo de un lado al otro de la muralla; 439 y
  // 517, otras dos puertas, entre dos murallas y en la última columna.
  const RARAS = [58, 86, 103, 270, 443, 699, 730];
  const SEMILLAS = segunPrisa(
    [1, 2, 8, 9, 31, 33, ...RARAS],
    [...rango(1, 40), ...RARAS, 439, 517],
  );
  for (const semilla of SEMILLAS)
    it(`semilla ${semilla}: la muralla cierra, sin espolones, juntas abiertas ni torres apiladas ni raíles, y nada sobre la senda`, () => {
      const e = escenaDe(semilla);
      expect(e.informe.muralla).toEqual(NADA);
      expect(e.informe.murallasPartidas).toBe(0);
      expect(e.informe.murallaIncoherente).toBe(0);
      expect(e.informe.torresApiladas).toBe(0);
      expect(e.informe.murallaSobreSenda).toBe(0);
      // Las torres, recontadas aquí sobre los sprites: ninguna tapa la senda pintada.
      const senda = sendaParaLaMuralla(e.sendas);
      const tapan = e.sprites.filter(
        (s) => s.clase === 'muro' && /torre-/.test(s.src ?? '') && senda.pisa(s),
      );
      expect(tapan.map((s) => `${s.src} en ${s.x},${s.y}`)).toEqual([]);
    });

  it('el nodo de otra barrera es un apoyo; la puerta de la muralla, no (s699 (15,2))', () => {
    const map = partidaDe(699).map;
    const a = analizar(map);
    const al = alrededorDeMurallas(a, [], new Array<number>(a.W * a.H).fill(0));
    const nodo = map.objects.find((o) => o.kind === 'node' && o.at.x === 15 && o.at.y === 2);
    if (nodo?.kind !== 'node') throw new Error('s699 no tiene el nodo de (15,2)');
    expect(nodo.barrera).toBe('cliff');
    expect(al.apoyos(15, 1)).toContain(`nodo:${nodo.id}`);
    const puerta = map.objects.find((o) => o.kind === 'node' && o.barrera === 'wall');
    if (puerta === undefined) throw new Error('s699 no tiene puertas de muralla');
    expect(al.apoyos(puerta.at.x, puerta.at.y)).not.toContain(`nodo:${puerta.id}`);
  });

  it('y el guardia mira algo: hay muros, puertas y tramos', () => {
    const map = partidaDe(1).map;
    const a = analizar(map);
    expect(a.franjas.filter((f) => f.barrera === 'wall').length).toBeGreaterThan(5);
    expect([...a.pasos.values()].filter((p) => p.barrera === 'wall').length).toBeGreaterThan(0);
    // 27 piezas desde #208, que dejó las murallas cortas (más de 30 antes).
    expect(escenaDe(1).sprites.filter((s) => s.clase === 'muro').length).toBeGreaterThan(20);
  });

  it('en una casilla de muro no se siembra la cubierta del campo (los huertos de s57)', () => {
    for (const semilla of [1, 57]) {
      const map = partidaDe(semilla).map;
      const e = escenaDe(semilla);
      const enMuro = e.sprites.filter(
        (s) =>
          s.clase === 'cubierta' &&
          map.terrain[Math.floor(s.y) * map.width + Math.floor(s.x)] === 'wall',
      );
      expect(enMuro.map((s) => `${s.src} en ${s.x.toFixed(2)},${s.y.toFixed(2)}`)).toEqual([]);
    }
  });
});

describe('la muralla de norte a sur, de lado (§29)', () => {
  it('sus tramos son las piezas muro-ns, de 1,6 de alto y por el medio, y no la tira de la hoja', () => {
    // s21 lleva dos puertas N-S con su lienzo arriba y abajo. Era s12, cuyas
    // dos puertas se quedaron con dos casillas de muro a cada lado al partirse
    // su muralla larga (#208): un tramo cada una.
    const e = escenaDe(21);
    const ns = e.sprites.filter((s) => /^muro-ns-[12]\.webp$/.test(s.src ?? ''));
    expect(ns.length).toBeGreaterThan(5);
    expect(new Set(ns.map((s) => s.src))).toEqual(new Set(['muro-ns-1.webp', 'muro-ns-2.webp']));
    for (const s of ns) {
      expect(s.clase).toBe('muro');
      expect(s.alto).toBe(1.6);
      expect(s.ax).toBe(s.nw / 2);
    }
    expect(e.sprites.filter((s) => s.src === 'modulos/muro/profundidad.webp')).toEqual([]);
  });

  it('la puerta N-S se mide por el alto y se apoya en el pie de su arco', () => {
    const e = escenaDe(12);
    const puertas = e.sprites.filter((s) => s.src === 'nodo-puerta-hondo.webp');
    expect(puertas.map((s) => s.objeto?.id).sort()).toEqual(['node-1', 'node-10']);
    for (const s of puertas) {
      expect(s.alto).toBe(2.6);
      expect(s.ay / s.nh).toBeCloseTo(0.625);
      expect(s.ax).toBe(s.nw / 2);
    }
  });
});
