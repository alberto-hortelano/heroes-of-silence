/**
 * La muralla de una franja de muro: por dónde va su lienzo, dónde lleva torres y
 * cuánto de lo pintado no se lee como barrera (#183, #197).
 *
 * La auditoría 3 vio murallas a trozos: el 66 % de las casillas de muro sin una
 * pieza cerca, puertas solas en el llano y columnas de torres donde el muro va
 * de norte a sur, con el guardia a 0 porque contaba el esqueleto y no lo que se
 * pintaba (#183). Luego el esqueleto se vio sin sentido: espolones a la nieve,
 * una esquina en cada escalón de la franja y juntas abiertas (#197). Aquí la
 * línea es la frontera: tiradas rectas de puerta y apoyo a puerta y apoyo
 * (`trazaDeMuralla`), torre en cada esquina (`torresDe`), y el guardia mira los
 * tramos que de verdad entraron en la escena (`murallaSinLeer`).
 *
 * Es puro: casillas entran y casillas salen.
 */
import { componentesDePasos, type Eje, type Esqueleto, ejeDe, type Paso } from './esqueleto.js';

type Casilla = readonly [number, number];

const clave = ([x, y]: Casilla) => `${x},${y}`;
const deClave = (k: string): Casilla => k.split(',').map(Number) as unknown as Casilla;

/** Las ocho direcciones en el sentido de las agujas del reloj: dos seguidas forman 45°. */
const RUMBOS: readonly Casilla[] = [
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
  [0, -1],
  [1, -1],
];

/**
 * Lo que cuesta una esquina, en casillas de lienzo: una esquina vale lo que
 * tres casillas de rodeo. Con menos, una franja en escalera daba una esquina en
 * cada escalón; con más, la línea se salía de la franja para no doblar.
 */
const ESQUINA = 3;

/**
 * Lo que cuesta además una esquina donde no cabe su torre (tapa la senda) o
 * junto a una puerta, que lleva las suyas: sin torre, la junta de dos tramos de
 * ejes distintos se ve abierta (s1 (15,5), #197).
 */
const ESQUINA_SIN_TORRE = 4;

/**
 * Lo que cuesta pisar una casilla del borde de la franja, dividido por su
 * hondura: en una franja de tres, la línea va por el medio y no pegada a un
 * lado (s32 (19-21, 19-24)). Es poco: nunca paga una esquina.
 */
const POR_EL_BORDE = 0.4;

/**
 * Lo que cuesta pisar una casilla al pie de otra más alta: la cara del
 * acantilado que baja de la alta cuelga sobre ella y tapaba el lienzo. Donde
 * la franja tiene un lado alto y otro bajo, el relieve la parte por el medio y
 * la línea iba justo al pie de la cara (s9 (8-12, 1-6)); así va por arriba, por
 * el borde de lo alto.
 */
const AL_PIE_DE_LA_CARA = 1.5;

/** Las casillas de la franja con una vecina (8-vecinas) más alta: al pie de una cara. */
function alPieDeUnaCara(casillas: readonly Casilla[], alrededor: Alrededor): Set<string> {
  return new Set(
    casillas
      .filter(([x, y]) =>
        RUMBOS.some(([dx, dy]) => alrededor.nivel(x + dx, y + dy) > alrededor.nivel(x, y)),
      )
      .map(clave),
  );
}

/** La distancia de cada casilla de la franja a cada lado pisable que toca (8-vecinas, por la franja; 1 la que lo toca). */
function distanciasALados(
  casillas: readonly Casilla[],
  dentro: ReadonlySet<string>,
  alrededor: Alrededor,
): Map<number, Map<string, number>> {
  const porLado = new Map<number, Map<string, number>>();
  for (const c of casillas)
    for (const [dx, dy] of RUMBOS) {
      const l = alrededor.lado(c[0] + dx, c[1] + dy);
      if (l < 0) continue;
      const d = porLado.get(l) ?? new Map<string, number>();
      d.set(clave(c), 1);
      porLado.set(l, d);
    }
  for (const d of porLado.values()) {
    let frente = casillas.filter((c) => d.has(clave(c)));
    for (let n = 2; frente.length > 0; n++) {
      const siguiente: Casilla[] = [];
      for (const [x, y] of frente)
        for (const [dx, dy] of RUMBOS) {
          const v: Casilla = [x + dx, y + dy];
          if (!dentro.has(clave(v)) || d.has(clave(v))) continue;
          d.set(clave(v), n);
          siguiente.push(v);
        }
      frente = siguiente;
    }
  }
  return porLado;
}

/** La hondura de cada casilla de la franja: 1 la que toca lo de fuera (8-vecinas), y hacia dentro. */
function honduras(casillas: readonly Casilla[], dentro: ReadonlySet<string>): Map<string, number> {
  const h = new Map<string, number>();
  let frente = casillas.filter(([x, y]) =>
    RUMBOS.some(([dx, dy]) => !dentro.has(clave([x + dx, y + dy]))),
  );
  for (const c of frente) h.set(clave(c), 1);
  for (let n = 2; frente.length > 0; n++) {
    const siguiente: Casilla[] = [];
    for (const [x, y] of frente)
      for (const [dx, dy] of RUMBOS) {
        const v: Casilla = [x + dx, y + dy];
        if (!dentro.has(clave(v)) || h.has(clave(v))) continue;
        h.set(clave(v), n);
        siguiente.push(v);
      }
    frente = siguiente;
  }
  return h;
}

/** Lo que la línea de una muralla necesita del mapa de alrededor de su franja. */
export interface Alrededor {
  /**
   * Lo de fuera que toca la casilla (8-vecinas, ella incluida): otra barrera,
   * el borde del mapa o la huella de una ciudad o un pueblo, cada cosa con su
   * nombre. Es donde la muralla se apoya; vacío, no se apoya en nada.
   */
  readonly apoyos: (x: number, y: number) => readonly string[];
  /** El lado de una casilla pisable (su componente sin nodos, como una región), o −1. */
  readonly lado: (x: number, y: number) => number;
  /**
   * Bajo la huella de qué ciudades o pueblos cae la casilla (sus nombres de
   * `apoyos`). Una muralla que se apoya en una llega hasta ahí, debajo de su
   * pieza: parada en la casilla de al lado, quedaba casilla y media de hueco
   * hasta lo pintado (s1 (13,2)).
   */
  readonly bajoCiudad: (x: number, y: number) => readonly string[];
  /** El nivel del relieve de la casilla (`relieve`): donde la franja cambia de nivel, cuelga una cara. */
  readonly nivel: (x: number, y: number) => number;
}

/** Cómo empieza el nombre de un apoyo que es la huella de una ciudad o un pueblo (`Alrededor.apoyos`). */
export const CIUDAD = 'ciudad:';

/** Una puerta para la línea: su casilla y hacia dónde se cruza (`PuertaDeMuralla.paso`). */
export interface PuertaDeLinea {
  readonly at: Casilla;
  readonly paso: Casilla;
}

/** Un grupo seguido de casillas de la franja que tocan la misma cosa de fuera, y los lados que tocan. */
interface Apoyo {
  readonly casillas: readonly Casilla[];
  readonly lados: ReadonlySet<number>;
}

/**
 * Los apoyos de una franja: por cada cosa de fuera que toca, sus casillas en
 * grupos seguidos, con los lados pisables que tocan. Los que tocan dos lados o
 * más son donde la frontera entre ellos acaba contra otra cosa, y la muralla
 * tiene que llegar ahí; uno con un solo lado (un bosque que toca la franja de
 * costado) no cierra nada: ir hasta él era un espolón.
 */
function apoyos(casillas: readonly Casilla[], alrededor: Alrededor): Apoyo[] {
  // Dos ciudades a los dos cabos de una franja corta son dos apoyos, no uno.
  const porCosa = new Map<string, Casilla[]>();
  for (const c of casillas)
    for (const cosa of alrededor.apoyos(c[0], c[1]))
      porCosa.set(cosa, [...(porCosa.get(cosa) ?? []), c]);
  const grupos: Apoyo[] = [];
  for (const [cosa, tocan] of porCosa) {
    const quedan = new Set(tocan.map(clave));
    for (const c of tocan) {
      if (!quedan.has(clave(c))) continue;
      quedan.delete(clave(c));
      const grupo: Casilla[] = [c];
      for (let k = 0; k < grupo.length; k++) {
        const [x, y] = grupo[k] as Casilla;
        for (const [dx, dy] of RUMBOS) {
          const v: Casilla = [x + dx, y + dy];
          if (!quedan.has(clave(v))) continue;
          quedan.delete(clave(v));
          grupo.push(v);
        }
      }
      const lados = new Set<number>();
      for (const [x, y] of grupo)
        for (const [dx, dy] of RUMBOS) {
          const l = alrededor.lado(x + dx, y + dy);
          if (l >= 0) lados.add(l);
        }
      // A una ciudad se llega por debajo de su pieza (`bajoCiudad`).
      const bajo = cosa.startsWith(CIUDAD)
        ? grupo.filter(([x, y]) => alrededor.bajoCiudad(x, y).includes(cosa))
        : [];
      grupos.push({ casillas: bajo.length > 0 ? bajo : grupo, lados });
    }
  }
  return grupos;
}

/** La casilla de `casillas` más lejos de `desde` por dentro de ellas (8-vecinas). */
function laMasLejana(desde: readonly Casilla[], casillas: readonly Casilla[]): Casilla {
  const dentro = new Set(casillas.map(clave));
  const vistas = new Set(desde.map(clave));
  let frente = [...desde];
  let ultima = desde[0] as Casilla;
  while (frente.length > 0) {
    const siguiente: Casilla[] = [];
    for (const [x, y] of frente)
      for (const [dx, dy] of RUMBOS) {
        const v: Casilla = [x + dx, y + dy];
        if (vistas.has(clave(v)) || !dentro.has(clave(v))) continue;
        vistas.add(clave(v));
        siguiente.push(v);
        ultima = v;
      }
    frente = siguiente;
  }
  return ultima;
}

/** Un camino de la línea: sus casillas en orden y lo que costó. */
interface Tirada {
  readonly casillas: readonly Casilla[];
  readonly coste: number;
}

/**
 * El camino de menos coste de `desde` a `hasta` por la franja: cada paso cuesta
 * lo que mide y cada esquina `ESQUINA` (más `ESQUINA_SIN_TORRE` donde no cabe la
 * torre o junto a una puerta). Nunca dobla más de 90°. Por una puerta solo se
 * sale y se entra de través a su paso: en recto o, pagando una esquina, en
 * diagonal; nunca por donde se cruza. No atraviesa otras puertas.
 */
function tirada(
  desde: readonly Casilla[],
  hasta: readonly Casilla[],
  puertaEn: ReadonlyMap<string, PuertaDeLinea>,
  dentro: ReadonlySet<string>,
  hondura: ReadonlyMap<string, number>,
  alPie: ReadonlySet<string>,
  cercaDePuerta: ReadonlySet<string>,
  torreCabe: (c: Casilla) => boolean,
  esquinaCabe: (c: Casilla) => boolean,
  llegada: (c: Casilla) => number,
): Tirada | null {
  const meta = new Set(hasta.map(clave));
  const pasoDe = (puerta: PuertaDeLinea | undefined, [dx, dy]: Casilla): number => {
    if (puerta === undefined) return 0;
    const px = Math.sign(puerta.paso[0]);
    const py = Math.sign(puerta.paso[1]);
    const d = dx * px + dy * py;
    if (d === 0) return 0;
    // De lado a lo largo del paso: la muralla cortaría su propio camino.
    if (dx * py - dy * px === 0) return Number.POSITIVE_INFINITY;
    return ESQUINA;
  };
  // Estado: casilla y rumbo de llegada (8 = sin rumbo, en la salida).
  const coste = new Map<string, number>();
  const previo = new Map<string, string | null>();
  const abiertos: { k: string; c: Casilla; r: number; g: number }[] = [];
  for (const c of desde) {
    const k = `${clave(c)}|8`;
    coste.set(k, 0);
    previo.set(k, null);
    abiertos.push({ k, c, r: 8, g: 0 });
  }
  const cerrados = new Set<string>();
  while (abiertos.length > 0) {
    let m = 0;
    for (let i = 1; i < abiertos.length; i++)
      if ((abiertos[i] as { g: number }).g < (abiertos[m] as { g: number }).g) m = i;
    const { k, c, r, g } = abiertos.splice(m, 1)[0] as (typeof abiertos)[number];
    if (cerrados.has(k)) continue;
    cerrados.add(k);
    if (meta.has(clave(c)) && r !== 8) {
      const casillas: Casilla[] = [];
      for (let p: string | null = k; p !== null; p = previo.get(p) ?? null) {
        const [x, y] = (p.split('|')[0] as string).split(',').map(Number) as [number, number];
        casillas.unshift([x, y]);
      }
      return { casillas, coste: g };
    }
    // Una puerta que no es la de salida es una meta, no un paso.
    if (r !== 8 && !dentro.has(clave(c))) continue;
    RUMBOS.forEach((d, nr) => {
      const v: Casilla = [c[0] + d[0], c[1] + d[1]];
      if (!dentro.has(clave(v)) && !meta.has(clave(v))) return;
      let g2 =
        g +
        (d[0] !== 0 && d[1] !== 0 ? Math.SQRT2 : 1) +
        POR_EL_BORDE / (hondura.get(clave(v)) ?? 1) +
        (alPie.has(clave(v)) ? AL_PIE_DE_LA_CARA : 0);
      if (r !== 8 && r !== nr) {
        const giro = Math.min((r - nr + 8) % 8, (nr - r + 8) % 8);
        // Donde la torre no entra ni encogida ni corrida, no se dobla: la junta
        // quedaría abierta o la torre sobre la senda (s49 (23,28)).
        if (giro > 2 || !esquinaCabe(c)) return;
        g2 += ESQUINA;
        if (!torreCabe(c) || cercaDePuerta.has(clave(c))) g2 += ESQUINA_SIN_TORRE;
      }
      if (r === 8) g2 += pasoDe(puertaEn.get(clave(c)), d);
      if (meta.has(clave(v))) g2 += pasoDe(puertaEn.get(clave(v)), d) + llegada(v);
      if (!Number.isFinite(g2)) return;
      const kv = `${clave(v)}|${nr}`;
      if ((coste.get(kv) ?? Number.POSITIVE_INFINITY) <= g2) return;
      coste.set(kv, g2);
      previo.set(kv, k);
      abiertos.push({ k: kv, c: v, r: nr, g: g2 });
    });
  }
  return null;
}

/**
 * La línea de una franja de muro (#197): tiradas rectas de la franja que unen
 * lo que la muralla tiene que unir —sus puertas y los apoyos donde la frontera
 * entre dos lados acaba contra otra barrera, el borde o una ciudad—, con el
 * menor número de esquinas. Se unen como un árbol de coste mínimo (Prim), así
 * que una puerta en medio queda entre sus dos tiradas.
 *
 * Antes era el esqueleto de la franja (Zhang-Suen), alargado hasta lo de fuera
 * y con lo lejano cosido como espolón: la franja del generador va a escalones y
 * con bultos (engorda de un lado y del otro por trechos), y el esqueleto los
 * copiaba. Salían espolones que no cerraban nada (s1 (13-15,4)), una esquina en
 * cada escalón y juntas de 45° sin torre que se veían abiertas (s1 (15,5)). Lo
 * que la línea deja de la franja es escombro.
 *
 * Cada tirada evita doblar (`ESQUINA`), va por el medio de la franja
 * (`POR_EL_BORDE`) y, donde la franja cambia de nivel, por lo alto
 * (`AL_PIE_DE_LA_CARA`). Lo que la línea deja abierto lo mide el guardia
 * (`fugasDe`) y se cierra con otra tirada; lo que cuelga sin llegar a nada se
 * poda (`sinEspolones`).
 *
 * Una franja que no separa dos lados (una mancha de ruina en una región) no
 * tiene apoyos: su línea sale de lo que toque, o de una punta, y va a la
 * casilla más alejada.
 */
export function trazaDeMuralla(
  casillas: readonly Casilla[],
  puertas: readonly PuertaDeLinea[],
  alrededor: Alrededor,
  torreCabe: (c: Casilla) => boolean = () => true,
  esquinaCabe: (c: Casilla) => boolean = torreCabe,
): Esqueleto {
  const primera = casillas[0];
  if (primera === undefined) return { casillas: [], pasos: [] };
  const dentro = new Set(casillas.map(clave));
  const esPuerta = new Set(puertas.map((p) => clave(p.at)));
  const hondo = honduras(casillas, dentro);
  const distancias = distanciasALados(casillas, dentro, alrededor);
  const alPie = alPieDeUnaCara(casillas, alrededor);
  const cercaDePuerta = new Set(
    puertas.flatMap((p) => RUMBOS.map(([dx, dy]) => clave([p.at[0] + dx, p.at[1] + dy]))),
  );
  const todos = apoyos(casillas, alrededor);
  const terminales: (readonly Casilla[])[] = [
    ...puertas.map((p) => [p.at]),
    ...todos.filter((g) => g.lados.size > 1).map((g) => g.casillas),
  ];
  // Sin dos sitios a los que llegar, de punta a punta de la franja.
  if (terminales.length === 0) {
    // Si toca algo, de ahí sale: un muro que arranca de la barrera, no suelto
    // por los dos cabos.
    const tocan = casillas.filter(([x, y]) => alrededor.apoyos(x, y).length > 0);
    terminales.push([tocan.length > 0 ? (tocan[0] as Casilla) : laMasLejana([primera], casillas)]);
  }
  if (terminales.length === 1) {
    const t = terminales[0] as readonly Casilla[];
    const pie = casillas.filter((c) =>
      t.some((u) => Math.max(Math.abs(u[0] - c[0]), Math.abs(u[1] - c[1])) <= 1),
    );
    const b = laMasLejana(pie.length > 0 ? pie : [primera], casillas);
    if (!t.some((c) => clave(c) === clave(b))) terminales.push([b]);
  }
  const puertaEn = new Map(puertas.map((p) => [clave(p.at), p] as const));
  // Prim: del primer terminal, cada vez la tirada más barata de uno que falte
  // a lo ya trazado. A lo trazado y no a otro terminal: un apoyo es un grupo
  // de casillas, y dos tiradas que llegaban a dos casillas distintas del mismo
  // dejaban la línea partida (s2 (22-24, 27)).
  const trazar = (ts: readonly (readonly Casilla[])[], pie: ReadonlySet<string>) => {
    const pasos = new Map<string, Paso>();
    const linea = new Map<string, Casilla>();
    const meter = (t: readonly Casilla[]) => {
      for (const c of t) linea.set(clave(c), c);
      for (let k = 1; k < t.length; k++) {
        const p = pasoEntre(t[k - 1] as Casilla, t[k] as Casilla);
        pasos.set(`${clave(p.a)}>${clave(p.b)}`, p);
      }
    };
    const faltan = ts.slice(1);
    const primero = ts[0] as readonly Casilla[];
    let trazado: readonly Casilla[] = primero;
    while (faltan.length > 0) {
      let mejor: { k: number; t: Tirada } | undefined;
      faltan.forEach((f, k) => {
        const t = tirada(
          f,
          trazado,
          puertaEn,
          dentro,
          hondo,
          pie,
          cercaDePuerta,
          torreCabe,
          esquinaCabe,
          // A lo ya trazado se llega por una esquina o una junta, salvo bajo una
          // ciudad, que la tapa: dos apoyos pegados bajo una ciudad hacían un
          // triángulo de tramos con cuatro torres (s2 (22-24, 27-28)).
          trazado === primero
            ? () => 0
            : (c) => (alrededor.bajoCiudad(c[0], c[1]).length > 0 ? 0 : ESQUINA),
        );
        if (t !== null && (mejor === undefined || t.coste < mejor.t.coste)) mejor = { k, t };
      });
      // Lo que no se alcanza por la franja (una puerta que solo la roza) se queda fuera.
      if (mejor === undefined) break;
      const { k, t } = mejor as { k: number; t: Tirada };
      faltan.splice(k, 1);
      meter(t.casillas);
      trazado = [...linea.values()];
    }
    if (linea.size === 0) meter([primera]);
    return { pasos: [...pasos.values()], linea: [...linea.values()] };
  };
  const fugasDeLaLinea = (h: { pasos: readonly Paso[]; linea: readonly Casilla[] }) =>
    fugasDe(
      casillas,
      [
        ...h.pasos.map((p) => ({ franja: 0, a: p.a, b: p.b })),
        ...h.linea.map((c) => ({ franja: 0, a: c, b: c })),
      ],
      [...esPuerta].map(deClave),
      alrededor,
    );
  // Donde la línea deja que un lado llegue a otro, se le añade un sitio más al
  // que llegar, el que más fugas cierra de los que la fuga pide (#197):
  //
  // - el apoyo que toca a los dos, por sus casillas más a medio camino de
  //   ambos: un apoyo largo que toca tres lados (la orilla de un río a lo largo
  //   de la franja) separa dos de ellos en un sitio y otros dos en otro, y la
  //   línea llegaba a él por un cabo y por el otro se rodeaba (s86 (22-24, 26-30));
  // - un apoyo que la fuga roza: la franja que acaba contra un acantilado que
  //   solo toca uno de los dos lados (s270 (1,10)-(1,11));
  // - donde la franja es más estrecha entre los dos: un lado que mete un dedo en
  //   la franja (s58 (22,8)).
  const cerrar = (pie: ReadonlySet<string>) => {
    const ts = [...terminales];
    let hecha = trazar(ts, pie);
    let fugas = fugasDeLaLinea(hecha);
    for (let vuelta = 0; vuelta < 4 && fugas.length > 0; vuelta++) {
      const { linea } = hecha;
      const enLinea = new Set(linea.map(clave));
      const candidatos = fugas.flatMap(({ entre: [a, b], porDonde }) => {
        const d = (l: number, c: Casilla) =>
          distancias.get(l)?.get(clave(c)) ?? Number.POSITIVE_INFINITY;
        const lasMejores = (g: readonly Casilla[], peso: (c: Casilla) => number) => {
          const libres = g.filter((c) => !enLinea.has(clave(c)));
          const menor = Math.min(...libres.map(peso));
          return libres.filter((c) => peso(c) === menor);
        };
        const medias = (g: readonly Casilla[]) => lasMejores(g, (c) => Math.abs(d(a, c) - d(b, c)));
        const pasa = new Set(porDonde.map(clave));
        const estrecho = Math.min(...casillas.map((c) => d(a, c) + d(b, c)));
        return [
          ...todos.filter((g) => g.lados.has(a) && g.lados.has(b)).map((g) => medias(g.casillas)),
          ...todos.map((g) => g.casillas.filter((c) => pasa.has(clave(c)))),
          Number.isFinite(estrecho)
            ? medias(casillas.filter((c) => d(a, c) + d(b, c) === estrecho))
            : [],
        ];
      });
      let mejor: { ts: (readonly Casilla[])[]; hecha: typeof hecha; fugas: Fuga[] } | undefined;
      const vistos = new Set<string>();
      for (const t of candidatos) {
        const k = t.map(clave).sort().join(' ');
        if (t.length === 0 || vistos.has(k)) continue;
        vistos.add(k);
        const otros = [...ts, t];
        const otra = trazar(otros, pie);
        const suyas = fugasDeLaLinea(otra);
        if (suyas.length < (mejor?.fugas.length ?? fugas.length))
          mejor = { ts: otros, hecha: otra, fugas: suyas };
      }
      if (mejor === undefined) break;
      ts.splice(0, ts.length, ...mejor.ts);
      hecha = mejor.hecha;
      fugas = mejor.fugas;
    }
    return { hecha, quedan: fugas.length };
  };
  // Cerrar manda más que ir por lo alto: si por lo alto queda por dónde
  // rodearla, como si no hubiera relieve (s103 (28,21): lo alto deja un dedo
  // del lado de arriba al otro lado de la muralla).
  const porLoAlto = cerrar(alPie);
  const cerrada = porLoAlto.quedan === 0 ? porLoAlto : cerrar(new Set());
  // Lo que cuelga de la línea sin llegar a nada es un espolón: la punta de
  // relleno de una franja con un solo apoyo, que otra tirada ya cerró (s270
  // (1,10)). Fuera, cabo a cabo, si con ello no se abre nada.
  const podada = sinEspolones(cerrada.hecha, esPuerta, alrededor);
  const hecha =
    separa(casillas, alrededor) && fugasDeLaLinea(podada).length <= cerrada.quedan
      ? podada
      : cerrada.hecha;
  return {
    casillas: hecha.linea,
    pasos: hecha.pasos,
  };
}

/** La línea sin las puntas que no tocan nada de fuera ni son una puerta, quitadas una tras otra. */
function sinEspolones(
  hecha: { readonly pasos: readonly Paso[]; readonly linea: readonly Casilla[] },
  esPuerta: ReadonlySet<string>,
  alrededor: Alrededor,
): { pasos: Paso[]; linea: Casilla[] } {
  let pasos = [...hecha.pasos];
  for (let cambio = true; cambio && pasos.length > 1; ) {
    cambio = false;
    const grado = new Map<string, number>();
    for (const p of pasos)
      for (const c of [p.a, p.b]) grado.set(clave(c), (grado.get(clave(c)) ?? 0) + 1);
    const suelta = (c: Casilla) =>
      grado.get(clave(c)) === 1 &&
      !esPuerta.has(clave(c)) &&
      alrededor.apoyos(c[0], c[1]).length === 0;
    const quedan = pasos.filter((p) => !suelta(p.a) && !suelta(p.b));
    if (quedan.length < pasos.length && quedan.length > 0) {
      pasos = quedan;
      cambio = true;
    }
  }
  const linea = new Map<string, Casilla>();
  for (const p of pasos) for (const c of [p.a, p.b]) linea.set(clave(c), c);
  return { pasos, linea: pasos.length > 0 ? [...linea.values()] : [...hecha.linea] };
}

/** El paso de `p` a `q`, vecinas, en el orden del esqueleto: de norte a sur y de oeste a este. */
const pasoEntre = (p: Casilla, q: Casilla): Paso =>
  p[1] < q[1] || (p[1] === q[1] && p[0] < q[0]) ? { a: p, b: q } : { a: q, b: p };

/** Lo que separa dos torres, en casillas: menos y se leían como una torre alta (#183). */
export const ENTRE_TORRES = 3;

/**
 * Las casillas de la línea donde una torre es obligada: sus puntas, donde se
 * ramifica y donde cambia de eje, a 45° o a 90°. En una esquina sin torre los
 * dos tramos se ven abiertos: el de norte a sur es una tira estrecha y el
 * diagonal apoya por su punta baja, y entre los dos quedaba un hueco (s1 (15,5),
 * #197). Lo que no es esquina ni punta lleva torre en lo recto cada
 * `ENTRE_TORRES`.
 */
export function esquinasDe(pasos: readonly Paso[]): Casilla[] {
  const ejes = new Map<string, { c: Casilla; ejes: Eje[] }>();
  for (const p of pasos)
    for (const c of [p.a, p.b]) {
      const e = ejes.get(clave(c)) ?? { c, ejes: [] };
      e.ejes.push(ejeDe(p));
      ejes.set(clave(c), e);
    }
  return [...ejes.values()]
    .filter((e) => e.ejes.length !== 2 || e.ejes[0] !== e.ejes[1])
    .map((e) => e.c);
}

/**
 * Dónde lleva torre la línea: en cada esquina y en cada punta (`esquinasDe`), y
 * en lo recto cada `ENTRE_TORRES`, nunca a menos de eso de otra torre. Ninguna
 * en las casillas de alrededor de una puerta, que lleva las suyas, ni bajo una
 * ciudad o un pueblo. Antes iba
 * una solo donde giraba 90° o más, y la junta de 45° quedaba abierta (#197).
 *
 * Tampoco donde `cabe` dice que no: una torre en la punta de la muralla, junto a
 * una ciudad, se plantaba encima de la senda que la rodea (s1 (21,10), #193). La
 * torre es adorno y el lienzo ya cierra; sin ella, la siguiente candidata. Salvo
 * en una casilla sin tramos y en una esquina. La línea evita doblar donde la
 * torre no cabe entera (`ESQUINA_SIN_TORRE`) y no dobla donde no cabe de ninguna
 * manera (`trazaDeMuralla`, `esquinaCabe`).
 */
export function torresDe(
  e: Esqueleto,
  puertas: readonly Casilla[],
  cabe: (c: Casilla) => boolean = () => true,
  bajoCiudad: (c: Casilla) => boolean = () => false,
): Casilla[] {
  const conPaso = new Set(e.pasos.flatMap((p) => [clave(p.a), clave(p.b)]));
  const esPuerta = new Set(puertas.map(clave));
  const esquina = new Set(esquinasDe(e.pasos).map(clave));
  // Las esquinas que juntan dos tramos o más; una punta no es junta.
  const grado = new Map<string, number>();
  for (const p of e.pasos)
    for (const c of [p.a, p.b]) grado.set(clave(c), (grado.get(clave(c)) ?? 0) + 1);
  const junta = new Set([...esquina].filter((k) => (grado.get(k) ?? 0) > 1));
  const junto = (c: Casilla) =>
    puertas.some((p) => Math.max(Math.abs(p[0] - c[0]), Math.abs(p[1] - c[1])) <= 1);
  const candidatas = e.casillas
    .filter((c) => !esPuerta.has(clave(c)))
    .map((c, orden) => ({ c, orden, obligada: esquina.has(clave(c)) || !conPaso.has(clave(c)) }))
    .sort((p, q) => Number(q.obligada) - Number(p.obligada) || p.orden - q.orden);
  const torres: Casilla[] = [];
  for (const { c, obligada } of candidatas) {
    // Bajo una ciudad la tapa su pieza, que lleva sus torres: una más asomaba
    // por encima de ella.
    if (junto(c) || bajoCiudad(c)) continue;
    // Una casilla sin tramos solo se ve por su torre: sin ella, la franja se
    // quedaba sin muralla (s2 (14,19)). Una esquina tampoco: sin torre, la
    // junta se ve abierta (s17 (10,31)). La que no cabe se encoge o se corre al
    // ponerla (`vestirMuralla`).
    if (conPaso.has(clave(c)) && !junta.has(clave(c)) && !cabe(c)) continue;
    if (!obligada && torres.some((t) => Math.hypot(t[0] - c[0], t[1] - c[1]) < ENTRE_TORRES))
      continue;
    torres.push(c);
  }
  return torres;
}

/** Un tramo de muralla que entró en la escena, de centro a centro de casilla; una torre, `a` = `b`. */
export interface TramoPintado {
  readonly franja: number;
  readonly a: Casilla;
  readonly b: Casilla;
}

/** Cada cuánto se mira la línea de un tramo contra la senda, en casillas. */
const PASO_POR_LA_LINEA = 0.05;

/**
 * Lo pintado de la muralla que cae sobre la senda (#193), por la casilla de cada
 * pieza: una torre que la tapa (`tapaLaTorre`, su rectángulo contra la senda
 * pintada) o un tramo, fuera de una puerta, cuya línea de centro a centro de
 * casilla pasa por ella (`cercaDeLaSenda`): una senda que cruza la muralla por
 * donde no hay puerta. El tramo que llega a una puerta es parte de ella: la
 * senda la cruza por ahí, y la puerta se pinta encima.
 *
 * Lo que de un tramo sube por encima de su línea no cuenta. El lienzo es la
 * barrera y no se aparta (#183): la senda que rodea la punta de una muralla va
 * por detrás de lo alto de su último tramo, como va por detrás de un nodo.
 */
export function murallaSobreLaSenda(
  pintados: readonly TramoPintado[],
  puertas: readonly Casilla[],
  tapaLaTorre: (c: Casilla) => boolean,
  cercaDeLaSenda: (x: number, y: number) => boolean,
): Casilla[] {
  const esPuerta = new Set(puertas.map(clave));
  return pintados.flatMap((t) => {
    if (clave(t.a) === clave(t.b)) return tapaLaTorre(t.a) ? [t.a] : [];
    if (esPuerta.has(clave(t.a)) || esPuerta.has(clave(t.b))) return [];
    const n = Math.ceil(Math.hypot(t.b[0] - t.a[0], t.b[1] - t.a[1]) / PASO_POR_LA_LINEA);
    for (let k = 0; k <= n; k++) {
      const x = t.a[0] + 0.5 + ((t.b[0] - t.a[0]) * k) / n;
      const y = t.a[1] + 0.5 + ((t.b[1] - t.a[1]) * k) / n;
      if (cercaDeLaSenda(x, y)) return [t.a];
    }
    return [];
  });
}

/** Una puerta de muralla: su casilla y la dirección de su paso (`ejeDelPaso`). */
export interface PuertaDeMuralla {
  readonly id: string;
  readonly at: Casilla;
  /** Hacia dónde se cruza, como vector; los muros quedan a sus dos lados. */
  readonly paso: Casilla;
}

/** Distancia del punto `p` a la recta `a`-`b` si cae de través al segmento; si cae más allá de sus cabos, infinita. */
function deTraves(p: readonly [number, number], a: Casilla, b: Casilla): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l = dx * dx + dy * dy;
  const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l;
  if (t < 0 || t > 1) return Number.POSITIVE_INFINITY;
  return Math.abs((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / Math.sqrt(l);
}

/**
 * Lo que tapa un tramo pintado a cada lado de su línea, para el guardia: la
 * media casilla, la casilla por la que pasa. Lo que queda entre un lienzo y el
 * bosque de al lado, a menos de media casilla, no se lee como paso (s42
 * (20,29-31): con 0,25 contaba como fuga una tira de un cuarto de casilla). El
 * tramo acaba en seco en el centro de su casilla; donde se juntan dos, la junta
 * tapa un círculo de ese radio, y una torre, el de `RADIO_DE_TORRE`. Con los
 * cabos redondos, dos tramos a una casilla se tocaban y un tramo de menos no
 * dejaba fuga.
 */
const MEDIO_LIENZO = 0.5;

/** Lo que tapa una torre suelta alrededor del centro de su casilla, para el guardia: es de 0,5 de ancho. */
const RADIO_DE_TORRE = 0.25;

/** Subdivisiones de una casilla con las que el guardia busca un paso entre la muralla y lo de fuera. */
const FINO = 4;

/** ¿Tiene la franja casillas pisables de dos lados distintos alrededor? Si no, no es frontera de nada. */
function separa(casillas: readonly Casilla[], alrededor: Alrededor): boolean {
  const lados = new Set<number>();
  for (const [x, y] of casillas)
    for (const [dx, dy] of RUMBOS) {
      const l = alrededor.lado(x + dx, y + dy);
      if (l >= 0) lados.add(l);
    }
  return lados.size > 1;
}

/** Dos lados que se juntan sin cruzar la muralla: una casilla del segundo y las de la franja por donde pasan. */
interface Fuga {
  readonly entre: readonly [number, number];
  readonly casilla: Casilla;
  readonly porDonde: readonly Casilla[];
}

/**
 * Por dónde se rodea la muralla de una franja: un lado que llega a otro por la
 * franja sin cruzar lo pintado. Se mira en una rejilla de `FINO` × `FINO` por
 * casilla, sobre la franja y las casillas pisables de alrededor: lo pintado
 * (tramos y torres, con `MEDIO_LIENZO` de ancho), lo que no es de ahí (otra
 * barrera, el borde), las puertas y la huella de una ciudad tapan. Cada punta
 * que se apoya se alarga hasta lo de fuera que toca: la torre del extremo se
 * arrima a la barrera. Devuelve, por cada dos lados que se juntan, los dos y una
 * casilla del segundo.
 */
function fugasDe(
  casillas: readonly Casilla[],
  pintados: readonly TramoPintado[],
  puertas: readonly Casilla[],
  alrededor: Alrededor,
): Fuga[] {
  const franja = new Set(casillas.map(clave));
  const esPuerta = new Set(puertas.map(clave));
  const lados = new Map<string, number>();
  for (const [x, y] of casillas)
    for (const [dx, dy] of RUMBOS) {
      const v: Casilla = [x + dx, y + dy];
      const l = alrededor.lado(v[0], v[1]);
      if (l >= 0 && !franja.has(clave(v))) lados.set(clave(v), l);
    }
  if (new Set(lados.values()).size < 2) return [];
  // Lo que tapa, en coordenadas del mundo (centro de casilla = +0,5): bandas
  // de cabo seco a lo largo de cada tramo y círculos en juntas y torres.
  const centro = (c: Casilla): Casilla => [c[0] + 0.5, c[1] + 0.5];
  const segmentos: [Casilla, Casilla][] = pintados
    .filter((t) => clave(t.a) !== clave(t.b))
    .map((t) => [centro(t.a), centro(t.b)]);
  const tramosEn = new Map<string, number>();
  for (const t of pintados)
    if (clave(t.a) !== clave(t.b))
      for (const c of [t.a, t.b]) tramosEn.set(clave(c), (tramosEn.get(clave(c)) ?? 0) + 1);
  const circulos: [Casilla, number][] = [
    ...[...tramosEn]
      .filter(([, n]) => n > 1)
      .map(([k]): [Casilla, number] => [centro(deClave(k)), MEDIO_LIENZO]),
    ...pintados
      .filter((t) => clave(t.a) === clave(t.b))
      .map((t): [Casilla, number] => [centro(t.a), RADIO_DE_TORRE]),
  ];
  const grado = new Map<string, { c: Casilla; n: number }>();
  for (const t of pintados) {
    if (!franja.has(clave(t.a)) && !franja.has(clave(t.b))) continue;
    for (const c of clave(t.a) === clave(t.b) ? [t.a] : [t.a, t.b]) {
      const g = grado.get(clave(c)) ?? { c, n: 0 };
      if (clave(t.a) !== clave(t.b)) g.n++;
      grado.set(clave(c), g);
    }
  }
  const fuera = (x: number, y: number) => !franja.has(clave([x, y])) && !lados.has(clave([x, y]));
  for (const { c, n } of grado.values()) {
    if (n > 1 || !franja.has(clave(c)) || alrededor.apoyos(c[0], c[1]).length === 0) continue;
    // Hasta lo más cercano de cada casilla de fuera que toca.
    for (const [dx, dy] of RUMBOS) {
      const v: Casilla = [c[0] + dx, c[1] + dy];
      if (!fuera(v[0], v[1]) && alrededor.bajoCiudad(v[0], v[1]).length === 0) continue;
      segmentos.push([
        [c[0] + 0.5, c[1] + 0.5],
        [
          Math.max(v[0], Math.min(v[0] + 1, c[0] + 0.5)),
          Math.max(v[1], Math.min(v[1] + 1, c[1] + 0.5)),
        ],
      ]);
    }
  }
  const todas = [
    ...casillas,
    ...[...lados.keys()].map((k) => k.split(',').map(Number) as unknown as Casilla),
  ];
  const x0 = Math.min(...todas.map((c) => c[0]));
  const y0 = Math.min(...todas.map((c) => c[1]));
  const w = (Math.max(...todas.map((c) => c[0])) - x0 + 1) * FINO;
  const h = (Math.max(...todas.map((c) => c[1])) - y0 + 1) * FINO;
  const libre = new Uint8Array(w * h);
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const cx = x0 + Math.floor(i / FINO);
      const cy = y0 + Math.floor(j / FINO);
      const k = clave([cx, cy]);
      if (esPuerta.has(k) || (!franja.has(k) && !lados.has(k))) continue;
      if (franja.has(k) && alrededor.bajoCiudad(cx, cy).length > 0) continue;
      const p: Casilla = [x0 + (i + 0.5) / FINO, y0 + (j + 0.5) / FINO];
      if (segmentos.some(([a, b]) => deTraves(p, a, b) <= MEDIO_LIENZO)) continue;
      if (circulos.some(([c, r]) => Math.hypot(p[0] - c[0], p[1] - c[1]) <= r)) continue;
      libre[j * w + i] = 1;
    }
  const marca = new Int32Array(w * h).fill(-1);
  const fugas: Fuga[] = [];
  for (let s = 0; s < w * h; s++) {
    if (!libre[s] || marca[s] !== -1) continue;
    marca[s] = s;
    const pila = [s];
    const vistos = new Map<number, Casilla>();
    const porDonde = new Map<string, Casilla>();
    while (pila.length > 0) {
      const t = pila.pop() as number;
      const c: Casilla = [
        x0 + Math.floor((t % w) / FINO),
        y0 + Math.floor(Math.floor(t / w) / FINO),
      ];
      if (franja.has(clave(c))) porDonde.set(clave(c), c);
      const l = lados.get(clave(c));
      if (l !== undefined && !vistos.has(l)) vistos.set(l, c);
      const i = t % w;
      for (const u of [i > 0 ? t - 1 : -1, i < w - 1 ? t + 1 : -1, t - w, t + w])
        if (u >= 0 && u < w * h && libre[u] && marca[u] === -1) {
          marca[u] = s;
          pila.push(u);
        }
    }
    const ls = [...vistos.keys()];
    for (let p = 0; p < ls.length; p++)
      for (let q = p + 1; q < ls.length; q++)
        fugas.push({
          entre: [ls[p] as number, ls[q] as number],
          casilla: vistos.get(ls[q] as number) as Casilla,
          porDonde: [...porDonde.values()],
        });
  }
  return fugas;
}

/**
 * Lo que de la muralla no se lee como barrera, contado sobre lo PINTADO (los
 * tramos y torres que entraron en la escena), no sobre la línea:
 *
 * - `fugas`: franjas por las que un lado llega a otro sin cruzar lo pintado
 *   (`fugasDe`), una casilla del lado al que se llega por cada una. Antes se
 *   pedía que cada casilla de muro tuviera un tramo a 1,42; con la
 *   línea de frontera (#197), lo que sobra de una franja es escombro, y lo que
 *   importa es que la muralla cierre;
 * - `puertasSueltas`: puertas con muro a un lado de su paso y ningún tramo que
 *   salga de ellas hacia ese lado;
 * - `huecos`: trozos de más en que queda partida la línea pintada de una franja;
 * - `espolones`: puntas de la línea de una franja que separa dos lados y que no
 *   llegan a nada (ni barrera, ni borde, ni ciudad, ni puerta): un
 *   muro que no cierra. Una ruina en medio de una región tiene sus dos cabos
 *   sueltos y no cuenta;
 * - `esquinasAbiertas`: casillas donde se juntan tramos de ejes distintos sin
 *   torre pintada encima, fuera de una puerta: la junta se ve abierta.
 */
export function murallaSinLeer(
  franjas: readonly { readonly id: number; readonly casillas: readonly Casilla[] }[],
  puertas: readonly PuertaDeMuralla[],
  esMuro: (x: number, y: number) => boolean,
  pintados: readonly TramoPintado[],
  alrededor: Alrededor,
  huellas: readonly (readonly Casilla[])[] = [],
): {
  fugas: Casilla[];
  puertasSueltas: string[];
  huecos: number;
  espolones: Casilla[];
  esquinasAbiertas: Casilla[];
} {
  const enPuerta = puertas.map((p) => p.at);
  const esPuerta = new Set(enPuerta.map(clave));
  const fugas = franjas.flatMap((f) =>
    fugasDe(f.casillas, pintados, enPuerta, alrededor).map((g) => g.casilla),
  );
  const puertasSueltas = puertas
    .filter((p) => {
      const lado = (c: Casilla) =>
        Math.sign(p.paso[0] * (c[1] - p.at[1]) - p.paso[1] * (c[0] - p.at[0]));
      const lados = new Set<number>();
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const c: Casilla = [p.at[0] + dx, p.at[1] + dy];
          if (esMuro(c[0], c[1]) && lado(c) !== 0) lados.add(lado(c));
        }
      const cubiertos = new Set(
        pintados.flatMap((t) =>
          clave(t.a) === clave(p.at) ? [lado(t.b)] : clave(t.b) === clave(p.at) ? [lado(t.a)] : [],
        ),
      );
      return [...lados].some((l) => !cubiertos.has(l));
    })
    .map((p) => p.id);
  // Lo que tapa la huella de una ciudad o un pueblo une lo que llega a ella: la
  // muralla de su pieza sigue el lienzo.
  const pegados = (t: TramoPintado) =>
    huellas.flatMap((h, k) =>
      [t.a, t.b].some((c) =>
        h.some((u) => Math.max(Math.abs(u[0] - c[0]), Math.abs(u[1] - c[1])) <= 1),
      )
        ? [k]
        : [],
    );
  let huecos = 0;
  for (const f of franjas) {
    const suyos = pintados.filter((t) => t.franja === f.id);
    if (suyos.length === 0) continue;
    const pasos = suyos.flatMap((t) => [
      { a: t.a, b: t.b },
      ...pegados(t).map((k): { a: Casilla; b: Casilla } => ({ a: t.a, b: [-1 - k, -1] })),
    ]);
    const casillas = [
      ...new Map(pasos.flatMap((p) => [p.a, p.b]).map((c) => [clave(c), c])).values(),
    ];
    const trozos = componentesDePasos(casillas, pasos);
    huecos += trozos - 1;
  }
  const espolones = franjas
    .filter((f) => separa(f.casillas, alrededor))
    .flatMap((f) => {
      const suyos = pintados.filter((t) => t.franja === f.id && clave(t.a) !== clave(t.b));
      const grado = new Map<string, { c: Casilla; n: number }>();
      for (const t of suyos)
        for (const c of [t.a, t.b]) {
          const g = grado.get(clave(c)) ?? { c, n: 0 };
          g.n++;
          grado.set(clave(c), g);
        }
      return [...grado.values()]
        .filter(
          ({ c, n }) =>
            n === 1 && !esPuerta.has(clave(c)) && alrededor.apoyos(c[0], c[1]).length === 0,
        )
        .map(({ c }) => c);
    });
  const torres = new Set(pintados.filter((t) => clave(t.a) === clave(t.b)).map((t) => clave(t.a)));
  const esquinasAbiertas = esquinasDe(pintados.filter((t) => clave(t.a) !== clave(t.b))).filter(
    (c) =>
      !torres.has(clave(c)) &&
      !esPuerta.has(clave(c)) &&
      // Bajo una ciudad, su pieza tapa la junta; junto a una puerta, la puerta,
      // que lleva sus torres y no deja poner otra (`torresDe`).
      alrededor.bajoCiudad(c[0], c[1]).length === 0 &&
      !enPuerta.some((p) => Math.max(Math.abs(p[0] - c[0]), Math.abs(p[1] - c[1])) <= 1) &&
      // Una punta no es una junta: la cubre `espolones`.
      pintados.filter(
        (t) => clave(t.a) !== clave(t.b) && (clave(t.a) === clave(c) || clave(t.b) === clave(c)),
      ).length > 1,
  );
  return { fugas, puertasSueltas, huecos, espolones, esquinasAbiertas };
}
