/**
 * La IA de reglas en los lugares de un mundo (P4 del usuario, F1a): una regla
 * simple. Mira las opciones que se pueden elegir ahora en el lugar —las de los
 * puntos que están, en los nodos a los que se llega por las opciones que solo
 * navegan— y, de las que **dan algo aún no cobrado o abren un encuentro no
 * vencido** (una batalla, solo con ventaja clara: `ventajaClara`, la regla de los
 * neutrales), se queda con **la que más vale** (`valorDeLaOpcion`, en oro). Si no
 * hay ninguna, elige entre las opciones sin premio que **llevan a una** en
 * `PASOS_HACIA_UN_PREMIO` elecciones (leer la carta que convence al guardián, pagar
 * el peaje ante el arcón), probadas sobre una copia del mundo (`trasElegir`), con la
 * misma cuenta: lo que vale el premio al que lleva más lo que cuesta ella. Lo que no
 * lleva a ningún premio no se elige: dos opciones sin premio que se encienden la una
 * a la otra (bajar y subir una palanca) no la tienen dando vueltas hasta
 * `MAX_JUGADAS_EN_UN_LUGAR` ni hacen que un lugar sin nada le siga valiendo
 * `VALOR_DE_LUGAR` cada día (M3 de la vuelta 2 de QA de la F1a). Cada premio se
 * cobra una vez por regla del núcleo (`EstadoDelMundo.cobradas` y `vencidos`), así
 * que lo que elige se acaba.
 *
 * **El orden en que está escrita la historia no decide nada** (#284, 11-11-2026).
 * Hasta entonces se quedaba con la primera opción con premio en el orden del
 * fichero, y era el motor, al escribir, quien elegía el desenlace del rival (y,
 * como el mundo es de los dos, el que se le cerraba a quien juega). Un empate de
 * valor —dos desenlaces que dan lo mismo— se desempata por `desempate`: un número
 * de la semilla de la partida, el jugador y **lo que es la opción** (su punto, su
 * nodo, su texto, su «si», su «hace», su «ir»), nunca su posición. No tira de
 * ninguna corriente de azar: `hariaAlgoEn` la usa para puntuar destinos, y mirar el
 * mapa no puede mover las tiradas de la partida.
 *
 * El agente no entra en los lugares (F4): esto es solo de la IA de reglas. Sin
 * mundo no hay lugares y nada de aquí cambia una partida del banco.
 */
import { pieza } from '../equipo/pieza.js';
import { fuerzaDe, poderDe, ventajaClara } from '../hero/fuerza.js';
import { gruposAlTope } from '../hero/grupos.js';
import {
  batallaDe,
  daPremio,
  type Efecto,
  type EstadoDelMundo,
  type Lugar,
  type Opcion,
  recordarLaConversacion,
  trasLosEfectos,
} from '../mundo/formato.js';
import {
  type Ante,
  lugarEn,
  motivoDeLaOpcion,
  nodoDe,
  nodosAlcanzables,
  puntosDe,
  type RefDeOpcion,
  soloNavega,
} from '../mundo/reglas.js';
import { hashDeTexto } from '../rng.js';
import type { GameState } from '../state/tipos.js';
import type { Hero } from '../types.js';
import { oroDeUnidad } from '../unidad/catalogo.js';

/**
 * Lo que vale para la IA ir a un lugar donde haría algo. **Inventado** (F1a,
 * 22-10-2026), sin medir equilibrio (no se piden medidas de jugabilidad): más que
 * un nodo ajeno sin regiones que cerrar (3 000) y que un neutral (2 000), y una
 * quinta parte de una ciudad (40 000), para que un lugar cercano merezca el
 * desvío; el objetivo se puntúa por punto de movimiento (`chooseHeroDestination`).
 */
export const VALOR_DE_LUGAR = 8000;

/** Tope de opciones que la IA elige seguidas en un lugar: una red, no una regla. */
export const MAX_JUGADAS_EN_UN_LUGAR = 8;

/**
 * Cuántas elecciones sin premio prueba la IA antes de dar con uno: las de una
 * historia corta (marca, peaje y arcón). Una red, no una regla, como el tope.
 */
const PASOS_HACIA_UN_PREMIO = 3;

/** Una opción que se puede elegir ahora, con dónde está. */
interface Elegible {
  readonly ref: RefDeOpcion;
  readonly opcion: Opcion;
}

/**
 * Las opciones con efectos que se pueden elegir ahora en `a`. El orden en que salen
 * es el de la historia, y **nadie lo usa para elegir** (`laQueMasVale`).
 */
function elegibles(a: Ante): Elegible[] {
  const out: Elegible[] = [];
  for (const p of puntosDe(a)) {
    for (const nodo of nodosAlcanzables(a, p)) {
      for (const [i, o] of nodoDe(a, p, nodo).opciones.entries()) {
        if (soloNavega(o) || motivoDeLaOpcion(a, p, nodo, i) !== null) continue;
        out.push({ ref: { lugar: a.lugar.id, punto: p.id, nodo, opcion: i }, opcion: o });
      }
    }
  }
  return out;
}

/**
 * Si la opción da algo que vale la pena ya: un premio (el núcleo ya ha dicho que no
 * está cobrado) o un encuentro (no vencido) con ventaja clara con la fuerza `miPoder`.
 */
function esUnPremio(a: Ante, o: Opcion, miPoder: number): boolean {
  const batalla = batallaDe(o);
  return batalla === null ? daPremio(o) : conVentaja(a, batalla, miPoder);
}

/**
 * Lo que vale un efecto, en oro: el oro que da (o, negativo, el que se paga), el
 * precio de la pieza que entra (o, negativo, el de la que sale), el de la tropa que
 * se une (`oroDeUnidad`, el de un novato) y, una batalla, lo que da su encuentro al
 * ganarlo. El estado y las marcas no valen nada por sí mismos: lo que abren lo cuenta
 * la opción a la que llevan (`mejorJugada`). Sin medir equilibrio (no se piden
 * medidas de jugabilidad): es la única escala que el catálogo ya tiene para las
 * cuatro cosas.
 */
function valorDelEfecto(a: Ante, e: Efecto): number {
  if ('oro' in e) return e.oro;
  if ('pieza' in e) return pieza(e.pieza).precio;
  if ('quitar' in e) return -pieza(e.quitar).precio;
  if ('tropa' in e) return e.tropa.n * oroDeUnidad(e.tropa.unidad);
  if ('batalla' in e) {
    const encuentro = a.lugar.encuentros[e.batalla];
    return encuentro === undefined ? 0 : sumaDelValor(a, encuentro.alGanar);
  }
  return 0;
}

function sumaDelValor(a: Ante, efectos: readonly Efecto[] | undefined): number {
  let total = 0;
  for (const e of efectos ?? []) total += valorDelEfecto(a, e);
  return total;
}

/**
 * Lo que vale elegir `o`, en oro: la suma de sus efectos (`valorDelEfecto`). Con
 * batalla, lo suyo se da al ganarla junto a lo de «alGanar», y se suma igual.
 */
function valorDeLaOpcion(a: Ante, o: Opcion): number {
  return sumaDelValor(a, o.hace);
}

/**
 * El desempate entre dos opciones que valen lo mismo: un entero de la semilla de la
 * partida, el jugador que elige y lo que **es** la opción —su punto y su nodo (ids,
 * no posiciones), su texto, su «si», su «hace» y su «ir»—, sin su índice. Así el
 * empate no lo decide el orden escrito (ni el motor, que no sabe la semilla) y cambia
 * de una partida a otra: dos desenlaces que dan lo mismo no se juegan siempre igual
 * desde el lado del rival. Es un hash (`hashDeTexto`), no una tirada: no gasta
 * ninguna corriente de azar, porque `hariaAlgoEn` lo pregunta al puntuar destinos.
 */
function desempate(a: Ante, x: Elegible): { readonly n: number; readonly clave: string } {
  const o = x.opcion;
  const clave = JSON.stringify([
    x.ref.punto,
    x.ref.nodo,
    o.texto,
    o.si ?? [],
    o.hace ?? [],
    o.ir ?? null,
  ]);
  return {
    n: hashDeTexto(`lugar|${a.state.seed}|${a.hero.owner}|${a.lugar.id}|${clave}`),
    clave,
  };
}

/**
 * De los candidatos, con lo que vale cada uno, el que más vale; con empate, el de
 * menor `desempate` y, si el hash coincide, el de menor clave (lo que es la opción,
 * comparado por unidades de código: igual en cualquier plataforma). Dos opciones con
 * la misma clave son la misma por lo que hacen y dónde están, y da igual cuál salga.
 */
function laQueMasVale(
  a: Ante,
  candidatos: readonly { readonly x: Elegible; readonly valor: number }[],
): { readonly x: Elegible; readonly valor: number } | null {
  let mejor: { x: Elegible; valor: number; n: number; clave: string } | null = null;
  for (const c of candidatos) {
    const { n, clave } = desempate(a, c.x);
    const gana =
      mejor === null ||
      c.valor > mejor.valor ||
      (c.valor === mejor.valor && (n < mejor.n || (n === mejor.n && clave < mejor.clave)));
    if (gana) mejor = { x: c.x, valor: c.valor, n, clave };
  }
  return mejor;
}

/**
 * Cómo quedaría el mundo si el dueño del héroe de `a` eligiera `o`: lo determinista
 * (el estado del lugar, las marcas, dónde queda su conversación). Lo que paga o
 * entrega no se descuenta: es una pregunta de por dónde se va, no de si alcanza.
 */
function trasElegir(a: Ante, ref: RefDeOpcion, o: Opcion): Ante {
  const tras = trasLosEfectos(a.mundo.estados[a.lugar.id], a.mundo.marcas, o.hace);
  const conversaciones = { ...a.mundo.conversaciones };
  recordarLaConversacion(conversaciones, a.hero.owner, ref, o);
  const mundo: EstadoDelMundo = {
    ...a.mundo,
    estados: { ...a.mundo.estados, [a.lugar.id]: tras.estado as string },
    marcas: [...tras.marcas],
    conversaciones,
  };
  return { ...a, mundo };
}

/**
 * Lo que la IA elige en `a` y lo que vale: de las opciones que son un premio
 * (`esUnPremio`), la que más vale (`laQueMasVale`); si no hay, de las sin premio tras
 * las que se llega a uno en `pasos` elecciones, la que más vale contando el premio al
 * que lleva. Ninguna de las dos mira la posición de la opción.
 */
function mejorJugada(
  a: Ante,
  miPoder: number,
  pasos = PASOS_HACIA_UN_PREMIO,
): { readonly ref: RefDeOpcion; readonly valor: number } | null {
  const todas = elegibles(a);
  const premios = todas
    .filter((x) => esUnPremio(a, x.opcion, miPoder))
    .map((x) => ({ x, valor: valorDeLaOpcion(a, x.opcion) }));
  if (premios.length > 0) {
    const elegida = laQueMasVale(a, premios);
    return elegida === null ? null : { ref: elegida.x.ref, valor: elegida.valor };
  }
  if (pasos <= 1) return null;
  const caminos: { x: Elegible; valor: number }[] = [];
  for (const x of todas) {
    if (batallaDe(x.opcion) !== null || daPremio(x.opcion)) continue;
    const tras = mejorJugada(trasElegir(a, x.ref, x.opcion), miPoder, pasos - 1);
    if (tras !== null) caminos.push({ x, valor: valorDeLaOpcion(a, x.opcion) + tras.valor });
  }
  const elegida = laQueMasVale(a, caminos);
  return elegida === null ? null : { ref: elegida.x.ref, valor: elegida.valor };
}

function conVentaja(a: Ante, encuentro: string, miPoder: number): boolean {
  const e = a.lugar.encuentros[encuentro];
  if (e === undefined) return false;
  // La que pelearía: en el tope de tropa de la partida (`defenderSide`).
  return ventajaClara(miPoder, poderDe({ troops: gruposAlTope(e.tropa, a.state.combate.tope) }));
}

/**
 * Lo que la IA elegiría ahora con `hero` en el lugar en que está, o `null`. No se
 * comprueba aparte con la puerta de la acción: se elige entre lo que ella acepta
 * (los nodos de `nodosAlcanzables`, el motivo de `motivoDeLaOpcion`), y si un día
 * no fuera así, la acción lanza con su motivo.
 */
export function jugadaEnElLugar(state: GameState, hero: Hero): RefDeOpcion | null {
  const mundo = state.mundo;
  const lugar = lugarEn(state, hero.at);
  if (mundo === undefined || lugar === null) return null;
  return mejorJugada({ state, mundo, hero, lugar }, fuerzaDe(hero))?.ref ?? null;
}

/**
 * Si la IA haría algo con `hero` si estuviera en `lugar`: lo que vale ir allí
 * (`objectValue`). Con el héroe tal como está y su fuerza, `miPoder`, que ya trae
 * quien elige el destino: nada de lo que se pregunta mira dónde está.
 */
export function hariaAlgoEn(state: GameState, hero: Hero, lugar: Lugar, miPoder: number): boolean {
  const mundo = state.mundo;
  if (mundo === undefined) return false;
  return mejorJugada({ state, mundo, hero, lugar }, miPoder) !== null;
}
