/**
 * La IA de reglas en los lugares de un mundo (P4 del usuario, F1a): una regla
 * simple. Recorre los puntos que están, en su orden, y en cada uno su diálogo en
 * anchura desde el inicio —por las opciones que solo navegan y valen—, y se queda
 * con la primera opción que se puede elegir y **da algo aún no cobrado o abre un
 * encuentro no vencido** (una batalla, solo con ventaja clara: `ventajaClara`, la
 * regla de los neutrales). Si no hay ninguna, la primera opción sin premio que
 * **lleva a una** en `PASOS_HACIA_UN_PREMIO` elecciones (leer la carta que convence
 * al guardián, pagar el peaje ante el arcón), probada sobre una copia del mundo
 * (`trasElegir`). Lo que no lleva a ningún premio no se elige: dos opciones sin
 * premio que se encienden la una a la otra (bajar y subir una palanca) no la tienen
 * dando vueltas hasta `MAX_JUGADAS_EN_UN_LUGAR` ni hacen que un lugar sin nada le
 * siga valiendo `VALOR_DE_LUGAR` cada día (M3 de la vuelta 2 de QA de la F1a). Cada
 * premio se cobra una vez por regla del núcleo (`EstadoDelMundo.cobradas` y
 * `vencidos`), así que lo que elige se acaba.
 *
 * El agente no entra en los lugares (F4): esto es solo de la IA de reglas. Sin
 * mundo no hay lugares y nada de aquí cambia una partida del banco.
 */
import type { Hero } from '../hero/hero.js';
import {
  batallaDe,
  daPremio,
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
import type { GameState } from '../state/game.js';
import { fuerzaDe, poderDe, ventajaClara } from './fuerza.js';

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
export const PASOS_HACIA_UN_PREMIO = 3;

/** Las opciones con efectos que se pueden elegir ahora en `a`, en el orden en que se leen. */
function elegibles(a: Ante): { readonly ref: RefDeOpcion; readonly opcion: Opcion }[] {
  const out: { ref: RefDeOpcion; opcion: Opcion }[] = [];
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
 * Lo que la IA elige en `a`: la primera opción que es un premio (`esUnPremio`) y, si
 * no hay, la primera sin premio tras la que se llega a uno en `pasos` elecciones.
 */
function primera(a: Ante, miPoder: number, pasos = PASOS_HACIA_UN_PREMIO): RefDeOpcion | null {
  const todas = elegibles(a);
  const premio = todas.find((x) => esUnPremio(a, x.opcion, miPoder));
  if (premio !== undefined) return premio.ref;
  if (pasos <= 1) return null;
  const camino = todas.find(
    (x) =>
      batallaDe(x.opcion) === null &&
      !daPremio(x.opcion) &&
      primera(trasElegir(a, x.ref, x.opcion), miPoder, pasos - 1) !== null,
  );
  return camino?.ref ?? null;
}

function conVentaja(a: Ante, encuentro: string, miPoder: number): boolean {
  const e = a.lugar.encuentros[encuentro];
  if (e === undefined) return false;
  return ventajaClara(miPoder, poderDe({ troops: e.tropa }));
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
  return primera({ state, mundo, hero, lugar }, fuerzaDe(hero, state.characters));
}

/**
 * Si la IA haría algo con `hero` si estuviera en `lugar`: lo que vale ir allí
 * (`objectValue`). Con el héroe tal como está y su fuerza, `miPoder`, que ya trae
 * quien elige el destino: nada de lo que se pregunta mira dónde está.
 */
export function hariaAlgoEn(state: GameState, hero: Hero, lugar: Lugar, miPoder: number): boolean {
  const mundo = state.mundo;
  if (mundo === undefined) return false;
  return primera({ state, mundo, hero, lugar }, miPoder) !== null;
}
