/**
 * Lo que de la muralla pintada no se lee como muralla, para los guardias de la escena
 * (`informe.murallasPartidas`, `murallaIncoherente`, `torresApiladas` y
 * `murallaSobreSenda`), contado sobre los tramos y las torres que de verdad entraron en
 * ella (`TramoPintado`) y no sobre la línea: lo que no cierra o no se lee como una
 * muralla (`murallaSinLeer`), las torres que se apilan (`apiladas`) y lo que cae sobre la
 * senda (`murallaSobreLaSenda`). Por dónde se rodea una franja (`fugasDe`) lo pregunta
 * también el trazado, y vive con él en `muralla.ts`. Era parte de `muralla.ts` hasta la
 * fase C de la reorganización (07-11-2026).
 */
import { componentesDePasos } from './esqueleto.js';
import {
  type Alrededor,
  type Casilla,
  clave,
  esquinasDe,
  fugasDe,
  type PuertaDeMuralla,
  puntasNorteSur,
  seApilan,
  separa,
  type TramoPintado,
} from './muralla.js';

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
 *   muro que no cierra. Una franja que no separa no lleva línea (es escombro)
 *   y no cuenta;
 * - `esquinasAbiertas`: casillas donde se juntan tramos de ejes distintos sin
 *   torre pintada encima, fuera de una puerta: la junta se ve abierta;
 * - `puntasSinTorre`: puntas de un tramo de norte a sur sin torre pintada, fuera
 *   de una puerta y de una ciudad: desde arriba, el tramo suelto se ve como una
 *   escalera o unos raíles (s1 (26,31-33), auditoría 4);
 * - `torresApiladas`: torres pintadas que se apilan con otra (`apiladas`).
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
  puntasSinTorre: Casilla[];
  torresApiladas: Casilla[];
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
  // Por franja: las puntas de dos franjas que se tocan no son la misma línea.
  const puntasSinTorre = franjas.flatMap((f) =>
    puntasNorteSur(pintados.filter((t) => t.franja === f.id && clave(t.a) !== clave(t.b))).filter(
      (c) =>
        !torres.has(clave(c)) &&
        alrededor.bajoCiudad(c[0], c[1]).length === 0 &&
        !enPuerta.some((p) => Math.max(Math.abs(p[0] - c[0]), Math.abs(p[1] - c[1])) <= 1),
    ),
  );
  return {
    fugas,
    puertasSueltas,
    huecos,
    espolones,
    esquinasAbiertas,
    puntasSinTorre,
    torresApiladas: apiladas(pintados),
  };
}

/**
 * Las torres pintadas que se apilan con otra (`seApilan`), de la misma franja o
 * de dos: cada una que tiene otra así antes que ella. Se leen como una sola
 * torre gorda o una chimenea, no como dos esquinas (#183, #197, auditoría 4):
 * la línea que dobla dos veces seguidas pone una en cada esquina, y nada lo
 * impedía más que el coste de la esquina.
 */
export function apiladas(pintados: readonly TramoPintado[]): Casilla[] {
  const torres = [
    ...new Map(
      pintados.filter((t) => clave(t.a) === clave(t.b)).map((t) => [clave(t.a), t.a]),
    ).values(),
  ];
  return torres.flatMap((t, k) => (torres.slice(0, k).some((u) => seApilan(u, t)) ? [t] : []));
}
