/**
 * El formato de un **mundo**: el contrato entre el motor de narrativa y el juego
 * (F1a de `docs/agents/2026-10-22-mapa-vivo/`).
 *
 * Un mundo es un paquete en disco (`assets/mundos/<id>/`) de tres ficheros: el
 * `mundo.json` (quién juega y con qué semilla), el `plan.json` (el plan del mapa
 * procedimental, **congelado**: el mapa no se mueve aunque cambie el generador) y
 * el `historia.json` (lo que escribe el motor: lugares, gente, diálogos y
 * encuentros). Los dos primeros los escribe el servidor de desarrollo; el tercero,
 * el motor, y lo juzga `problemasDelMundo` (`validar.ts`).
 *
 * El vocabulario de condiciones y efectos es **cerrado**: cada palabra es una regla
 * del núcleo, con su `*Blocker` y su hecho en la crónica (`reglas.ts`, `game.ts`).
 * El texto libre va solo en lo que es presentación (nombres, líneas, descripciones).
 * Por eso las palabras se declaran aquí una vez, con su frase para el motor
 * (`VOCABULARIO`), y la lectura que se le da (`lectura.ts`) sale de ellas y no de la
 * skill: una palabra nueva sin frase no compila.
 */
import type { GrupoDeTropa } from '../data.js';
import { type MapPlan, REGIONES_POR_BANDO } from '../map/generate.js';
import type { Persona } from '../town/voces.js';
import type { FactionId, Point } from '../types.js';
import { esIdDePieza, esIdDeUnidad } from '../validar.js';

/** La versión del formato. Otra se rechaza diciéndolo: sin compatibilidad hacia atrás. */
export const VERSION_DEL_MUNDO = 1;

/** Lo largo de un id de un mundo o de dentro de su historia. */
const LARGO_DE_UN_ID = 48;

/**
 * La forma del id de un mundo (su carpeta): la de un id de la arena —minúsculas,
 * cifras y guiones (`esIdDeUnidad`)—, de hasta `LARGO_DE_UN_ID`. Es lo que va en
 * `?mundo=` y en una ruta de disco, así que nada de puntos ni barras.
 */
export function esIdDeMundo(id: string): boolean {
  return id.length <= LARGO_DE_UN_ID && esIdDeUnidad(id);
}

/**
 * Por qué `id` no es el de un mundo, o `null`. **La única frase**: la dicen la
 * validación, la página (`?mundo=`), el disco y el servidor de desarrollo.
 */
export function idDeMundoBlocker(id: string): string | null {
  return esIdDeMundo(id)
    ? null
    : `"${id}" no es el id de un mundo: minúsculas, cifras y «-», de 1 a ${LARGO_DE_UN_ID}`;
}

/**
 * El mundo de `?mundo=`: `null` si no pide ninguno (vacío es no pedir, la regla de
 * `parseSeed`), y lanza con lo que no es un id (`idDeMundoBlocker`).
 */
export function parseMundo(texto: string | null | undefined): string | null {
  if (texto === null || texto === undefined || texto.trim() === '') return null;
  const motivo = idDeMundoBlocker(texto);
  if (motivo !== null) throw new Error(motivo);
  return texto;
}

/** La forma de los ids de dentro de una historia (lugares, puntos, nodos, marcas…): la de una pieza. */
export function esIdDeHistoria(id: string): boolean {
  return id.length <= LARGO_DE_UN_ID && esIdDePieza(id);
}

/**
 * Los tamaños de mapa con que se pide un mundo nuevo desde el menú, en regiones
 * por bando, con su nombre: los que admiten el menú y el servidor que lo genera.
 */
export const TAMAÑOS_DE_UN_MUNDO = [
  { regiones: 4, nombre: 'Pequeño', que: 'cuatro regiones por bando' },
  {
    regiones: REGIONES_POR_BANDO,
    nombre: 'Mediano',
    que: 'cinco regiones por bando, el de siempre',
  },
  { regiones: 7, nombre: 'Grande', que: 'siete regiones por bando' },
] as const;

/** El tamaño que el menú trae marcado: el del procedimental de siempre. */
export const TAMAÑO_POR_DEFECTO = REGIONES_POR_BANDO;

/**
 * `mundo.json`: con qué semilla y qué héroe se juega. Lo escribe el servidor. Lo
 * que el plan ya sabe no se repite aquí: la facción de quien juega es la de la
 * base del jugador 0 del plan (`basesDelPlan`), y el tamaño, el del plan.
 */
export interface Mundo {
  readonly version: typeof VERSION_DEL_MUNDO;
  readonly id: string;
  /** La semilla de la partida: la del procedimental que hizo el plan y la de la escena. */
  readonly semilla: number;
  readonly jugador: { readonly heroe: string };
  /** Cuántos rivales de la IA: 1 en la F1a, hasta que el generador sepa de más bandos. */
  readonly rivales: number;
}

export const CLAVES_DE_CONDICION = ['estado', 'marca', 'oro', 'lleva', 'faccion', 'no'] as const;
export type ClaveDeCondicion = (typeof CLAVES_DE_CONDICION)[number];

/**
 * Una condición. Una lista de condiciones es un «y»; `no` niega una sola.
 * Sin «o»: dos opciones con su condición cada una dicen lo mismo y se leen mejor.
 */
export type Condicion =
  /** Este lugar está en ese estado. */
  | { readonly estado: string }
  /** Esa marca del mundo está puesta. */
  | { readonly marca: string }
  /** Quien juega tiene al menos ese oro. */
  | { readonly oro: number }
  /** El héroe lleva esa pieza: puesta, en su tropa o en la mochila. */
  | { readonly lleva: string }
  /** El héroe es de esa facción. */
  | { readonly faccion: FactionId }
  | { readonly no: Condicion };

export const CLAVES_DE_EFECTO = [
  'estado',
  'marca',
  'oro',
  'pieza',
  'quitar',
  'tropa',
  'batalla',
] as const;
export type ClaveDeEfecto = (typeof CLAVES_DE_EFECTO)[number];

/** Un efecto: lo que hace una opción al elegirla. Se aplican en orden, todos o ninguno. */
export type Efecto =
  /** Este lugar pasa a ese estado. */
  | { readonly estado: string }
  /** Se pone esa marca del mundo (no se quita nunca). */
  | { readonly marca: string }
  /** Se gana (positivo) o se paga (negativo) ese oro; pagar sin tenerlo apaga la opción. */
  | { readonly oro: number }
  /** Esa pieza va a la mochila del héroe. */
  | { readonly pieza: string }
  /** Esa pieza sale de la mochila del héroe; sin ella, la opción se apaga. */
  | { readonly quitar: string }
  /** Se unen al héroe `n` de esa unidad del catálogo; si no caben, la opción se apaga. */
  | { readonly tropa: { readonly unidad: string; readonly n: number } }
  /** Se pelea ese encuentro del lugar. Va el último de su lista. */
  | { readonly batalla: string };

/** Lo que se aplica al ganar un encuentro: ni pagos ni tropa (podrían no caber), ni otra batalla. */
export const EFECTOS_AL_GANAR: readonly ClaveDeEfecto[] = ['estado', 'marca', 'oro', 'pieza'];
/** Lo que se aplica al perderlo: solo lo que cambia el mundo. */
export const EFECTOS_AL_PERDER: readonly ClaveDeEfecto[] = ['estado', 'marca'];

/**
 * Cada palabra del vocabulario con su frase, para el motor. **Exhaustivo por tipo**:
 * una clave nueva sin frase no compila, y la lectura (`lecturaParaElMotor`) se
 * escribe de aquí.
 */
export const VOCABULARIO: {
  readonly condiciones: Readonly<Record<ClaveDeCondicion, string>>;
  readonly efectos: Readonly<Record<ClaveDeEfecto, string>>;
  readonly alGanar: readonly ClaveDeEfecto[];
  readonly alPerder: readonly ClaveDeEfecto[];
  readonly reglas: readonly string[];
} = {
  condiciones: {
    estado: '{"estado": "<id>"}: este lugar está en ese estado (uno de sus «estados»)',
    marca:
      '{"marca": "<id>"}: esa marca del mundo está puesta (declárala en «marcas», con su «falta» y su «ya»)',
    oro: '{"oro": n}: quien juega tiene al menos n de oro',
    lleva: '{"lleva": "<pieza>"}: el héroe lleva esa pieza, puesta o en la mochila',
    faccion: '{"faccion": "<facción>"}: el héroe es de esa facción',
    no: '{"no": <condición>}: lo contrario de una condición',
  },
  efectos: {
    estado: '{"estado": "<id>"}: el lugar pasa a ese estado (va a la crónica)',
    marca: '{"marca": "<id>"}: pone esa marca del mundo; no se quita nunca',
    oro: '{"oro": n}: con n > 0 da ese oro; con n < 0 lo cobra, y sin él la opción sale apagada',
    pieza: '{"pieza": "<id>"}: esa pieza del catálogo va a la mochila del héroe',
    quitar:
      '{"quitar": "<id>"}: esa pieza sale de la mochila del héroe; sin ella, la opción sale apagada',
    tropa:
      '{"tropa": {"unidad": "<id>", "n": n}}: se le unen n de esa unidad; si no le caben, la opción sale apagada',
    batalla:
      '{"batalla": "<encuentro>"}: se pelea ese encuentro del lugar con la batalla de siempre; va el último',
  },
  alGanar: EFECTOS_AL_GANAR,
  alPerder: EFECTOS_AL_PERDER,
  reglas: [
    'una lista de condiciones es un «y»; para «o», dos opciones',
    'una opción con «hace» que da algo (oro > 0, pieza, tropa) o abre una batalla tiene que apagarse a sí misma: sus efectos (o los de «alGanar», si pelea) cambian el estado del lugar o ponen una marca que su condición («si» de la opción o de su punto) deja de cumplir. Cada premio se cobra una vez',
    'sin «ir», una opción cierra la conversación',
    'todo nodo de un diálogo se alcanza desde su «inicio»; cada punto lleva su propio diálogo',
    'una opción con «hace» solo se puede elegir en un nodo al que se llega desde el «inicio» por opciones sin «hace» cuyo «si» se cumple ahora: tras una que hace algo, la conversación puede seguir para leer o navegar, pero lo que haga algo va en un nodo alcanzable navegando',
    'un encuentro es tropa del catálogo, sin héroe, con el tope de liderazgo y de fuerza de un grupo neutral',
  ],
};

/** Una marca del mundo, con lo que se dice cuando falta y cuando ya está. */
export interface Marca {
  /** Por qué una opción que pide la marca sale apagada: «aún no conoces al capitán». */
  readonly falta: string;
  /** Por qué una opción que pide que NO esté sale apagada: «ya le has pagado el peaje». */
  readonly ya: string;
}

export interface Opcion {
  readonly texto: string;
  readonly si?: readonly Condicion[];
  readonly hace?: readonly Efecto[];
  /** El nodo al que lleva; sin él, la conversación se cierra. */
  readonly ir?: string;
}

export interface NodoDeDialogo {
  readonly texto: string;
  readonly opciones: readonly Opcion[];
}

export interface Dialogo {
  readonly inicio: string;
  readonly nodos: Readonly<Record<string, NodoDeDialogo>>;
}

/** Un punto de interés de la escena del lugar: alguien con quien hablar o algo que mirar. */
export interface Punto {
  readonly id: string;
  /** Dónde está en la escena, de 0 (la izquierda) a 1 (la derecha). Presentación. */
  readonly x: number;
  /** Si no se cumple, el punto no está. */
  readonly si?: readonly Condicion[];
  readonly dialogo: string;
  /** Una persona (con la forma de la gente de la base) o una cosa: uno de los dos. */
  readonly persona?: Persona;
  readonly cosa?: { readonly nombre: string };
}

export interface Encuentro {
  readonly nombre: string;
  readonly tropa: readonly GrupoDeTropa[];
  readonly alGanar: readonly Efecto[];
  readonly alPerder: readonly Efecto[];
}

/** Un lugar: un objeto del mapa que se visita, con su escena lateral. */
export interface Lugar {
  readonly id: string;
  readonly nombre: string;
  readonly at: Point;
  /** El fondo de la escena: la plaza de la base de esa facción (sin arte nuevo en la F1a). */
  readonly fondo: { readonly plaza: FactionId };
  /** Los estados posibles, por id, con su nombre para la persona. */
  readonly estados: Readonly<Record<string, string>>;
  readonly estadoInicial: string;
  readonly puntos: readonly Punto[];
  readonly dialogos: Readonly<Record<string, Dialogo>>;
  readonly encuentros: Readonly<Record<string, Encuentro>>;
}

/** `historia.json`: lo que escribe el motor. */
export interface Historia {
  readonly titulo: string;
  readonly resumen: string;
  readonly marcas: Readonly<Record<string, Marca>>;
  readonly lugares: readonly Lugar[];
}

declare const MARCA_DE_LEIDO: unique symbol;

/**
 * Un mundo leído y juzgado entero: sus tres ficheros y la facción de quien juega
 * (la de la base del jugador 0 del plan). **Solo lo produce la lectura**
 * (`leerMundo`): el tipo lleva una marca que nadie más pone sin un `as`, y eso lo
 * vigila `test/invariantes.test.ts`. Por eso `newGame` lo juega sin juzgarlo otra
 * vez: lo que lleva la marca ya pasó por `problemasDelMundo`.
 */
export interface MundoLeido {
  readonly [MARCA_DE_LEIDO]: true;
  readonly mundo: Mundo;
  readonly plan: MapPlan;
  readonly historia: Historia;
  readonly faccion: FactionId;
}

/**
 * Lo que una partida lleva de su mundo (`GameState.mundo`): la historia, que no
 * cambia, y lo que sí, que es estado de la partida.
 */
export interface EstadoDelMundo {
  readonly historia: Historia;
  /** El estado de cada lugar, por su id. */
  readonly estados: Record<string, string>;
  /** Las marcas puestas, en el orden en que se pusieron. */
  readonly marcas: string[];
}

/** El lugar `id` de una historia, o `null` si no está: la búsqueda por id de quien pregunta. */
export function lugarSiExiste(historia: Historia, id: string): Lugar | null {
  return historia.lugares.find((x) => x.id === id) ?? null;
}

/** El lugar `id` de una historia; lanza si no está (`lugarSiExiste`). */
export function lugarDe(historia: Historia, id: string): Lugar {
  const l = lugarSiExiste(historia, id);
  if (l === null) throw new Error(`no hay ningún lugar "${id}" en «${historia.titulo}»`);
  return l;
}

/** El nombre de un punto para la persona: el de su persona o el de su cosa. */
export function nombreDelPunto(p: Punto): string {
  return p.persona?.nombre ?? p.cosa?.nombre ?? p.id;
}

/** Los efectos de una lista que son de esa clave, ya estrechados. */
export function efectosDe<K extends ClaveDeEfecto>(
  efectos: readonly Efecto[] | undefined,
  clave: K,
): Extract<Efecto, Record<K, unknown>>[] {
  return (efectos ?? []).filter((e): e is Extract<Efecto, Record<K, unknown>> => clave in e);
}
