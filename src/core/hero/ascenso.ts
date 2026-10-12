/**
 * La tropa que se hace héroe (ciclo B de «la tropa crece»): **quién puede** y
 * **a quién no hay que volver a preguntar**. Puro, sin estado propio y sin
 * escribir nada.
 *
 * La regla la pidió el usuario en `NuevaJugabilidad.md` («Experiencia»): «si
 * llegan a nivel máximo se convierten en héroes al llegar a la base. El héroe lo
 * crea la IA en base al personaje». Y la acotó: **solo con narrador**. Sin
 * agente no pasa nada, así que el núcleo no decide nunca un ascenso: dice quién
 * podría (`veteranosEn`) y lo aplica cuando alguien se lo pide
 * (`ascenderVeterano`, en `game.ts`, que es el único que escribe la crónica).
 *
 * Lo que vive en `game.ts` y no aquí —`veteranosEnSuBase`, `ascensoBlocker`,
 * `heroeEnElPueblo`— lo hace porque necesita `baseOf`, `heroesOf` y el tope de
 * héroes, y este módulo importándolos cerraría un ciclo con el que lo importa a
 * él.
 */
import { tipoDeHeroe, tiposDeHeroe } from '../data.js';
import type { Town } from '../town/town.js';
import type { FactionId, Veterania } from '../types.js';
import { RANGO_MAXIMO_DE_TROPA, rangoDeTropa } from './experiencia.js';
import type { Hero } from './hero.js';

/**
 * Un veterano que ya puede hacerse héroe, y dónde está: en `base` y, si no está
 * en su guarnición, en la tropa del héroe `heroe`. La base va entera porque la
 * leen los tres que vienen detrás —el ascenso para sacarlo de ella, la petición
 * para nombrarla y el acuse para decir dónde nace— y así ninguno la vuelve a
 * buscar.
 */
export interface VeteranoEnBase {
  readonly veterania: Veterania;
  readonly creature: string;
  readonly base: Town;
  /** El héroe que lo lleva, o `null` si está en la guarnición. */
  readonly heroe: string | null;
}

/**
 * Los individuos de nivel máximo que hay en `base`: los de su guarnición y los
 * de la tropa de `heroeDentro`, el héroe del dueño que está en su casilla
 * (`heroeEnElPueblo`, en `game.ts`: se recibe resuelto porque buscarlo aquí
 * cerraría el ciclo de imports). En ese orden —guarnición primero— porque es el
 * orden en que se le pregunta al narrador, y tiene que ser el mismo en cada
 * pasada.
 *
 * Un personaje (`member`) no entra aunque tenga hoja: ya es alguien con nombre,
 * y su cuerpo no está en el catálogo, así que no hay criatura que contarle al
 * narrador. Un novato no entra porque no tiene hoja, y un veterano por debajo
 * del tope tampoco.
 */
export function veteranosEn(base: Town, heroeDentro: Hero | undefined): VeteranoEnBase[] {
  const out: VeteranoEnBase[] = [];
  const listo = (t: Hero['army'][number]): t is typeof t & { veterania: Veterania } =>
    t.member === undefined &&
    t.veterania !== undefined &&
    rangoDeTropa(t.veterania) >= RANGO_MAXIMO_DE_TROPA;
  for (const t of base.garrison) {
    if (listo(t)) out.push({ veterania: t.veterania, creature: t.creature, base, heroe: null });
  }
  if (heroeDentro === undefined) return out;
  for (const t of heroeDentro.army) {
    if (listo(t)) {
      out.push({ veterania: t.veterania, creature: t.creature, base, heroe: heroeDentro.id });
    }
  }
  return out;
}

/**
 * A quién se pregunta esta vez y a quién hay que recordar para la siguiente.
 *
 * «No se reintenta hasta que vuelva a la base» se lee así: se le pregunta una
 * vez, y se le recuerda **mientras siga allí al empezar cada turno**. En cuanto
 * un turno empieza sin él —salió con un héroe, o cayó—, se le olvida, y la
 * siguiente vez que esté se le vuelve a preguntar. Volver es haber faltado.
 *
 * `recordar` es lo ya preguntado que sigue en la base; `preguntar`, lo que está y
 * no se ha preguntado. Quien llama añade a `recordar` lo que pregunte de verdad
 * —y nada de lo que el tope le impida preguntar, para que espere su sitio—.
 */
export function porPreguntar<T extends { readonly veterania: { readonly id: string } }>(
  enBase: readonly T[],
  yaPreguntados: ReadonlySet<string>,
): { readonly preguntar: T[]; readonly recordar: Set<string> } {
  const recordar = new Set(enBase.map((v) => v.veterania.id).filter((id) => yaPreguntados.has(id)));
  return { preguntar: enBase.filter((v) => !recordar.has(v.veterania.id)), recordar };
}

/**
 * Por qué `heroType` no vale para un héroe de `faction`, o `null` si vale. La
 * frase nombra los que sí, porque quien la recibe es el narrador y la corrige
 * leyéndola. El tipo llega como texto libre —el esquema no lo acota, igual que
 * la criatura de un plan de mapa— y es aquí donde se comprueba.
 */
export function problemaDeTipo(faction: FactionId, heroType: string): string | null {
  if (tipoDeHeroe(faction, heroType) !== null) return null;
  const validos = tiposDeHeroe(faction)
    .map((t) => t.id)
    .join(', ');
  return `"${heroType}" no es un tipo de héroe de ${faction}: valen ${validos}`;
}
