/**
 * Los poderes de unidad: lo que una unidad de la ARENA usa ella misma en su turno
 * —curar a un aliado, bendecirlo— en vez de golpear (decisión del usuario,
 * 11-10-2026: «Curar y Bendecir», solo en la arena).
 *
 * Un poder no es una regla nueva: es un hechizo del héroe (`data/spells.json`)
 * con otro lanzador (`Lanzador`, `spells.ts`), así que la cura tiene el mismo tope
 * (`curaDe`) y la Bendición es la MISMA que la del héroe —el mismo origen,
 * `bless`—: dos seguidas, o una del héroe y otra del monje, se refrescan y no se
 * suman (`applyEffect`).
 * Lo que es del poder son sus cifras: cuánto cura y cuántas rondas dura, en
 * `data/poderes.json`, inventadas y dichas así en su `_comment`.
 *
 * Puro y sin importar `battle.ts`: lo lee el motor (`poderBlocker`, la jugada
 * `poder`), la arena (qué habilidad da qué poder) y la IA de batalla.
 */
import poderesJson from '../../../data/poderes.json' with { type: 'json' };
import type { PoderId } from '../types.js';
import { entero, repetidoEn, texto } from '../validar.js';
import { type Lanzador, type Spell, spell } from './spells.js';

export type { PoderId };

/**
 * Un poder: el hechizo que aplica y la unidad como su lanzador, con las cifras
 * del poder (`lanzador`: cuánto cura, cuántas rondas dura) en vez del poder
 * mágico de un héroe. Lo demás —el tope de la cura, el efecto, su origen— es del
 * hechizo (`spells.ts`), el mismo para los dos.
 */
export interface Poder {
  readonly id: PoderId;
  /** Como se dice en un botón y en el parte: «Curar», «Bendecir». */
  readonly nombre: string;
  /** El nombre de la habilidad que lo da, en `UnidadDeArena.habilidades`. */
  readonly habilidad: string;
  /** El hechizo cuyo efecto aplica. Siempre a un aliado. */
  readonly hechizo: Spell;
  readonly lanzador: Lanzador;
}

const CAMPOS_DEL_PODER = ['id', 'nombre', 'habilidad', 'hechizo', 'cura', 'rondas'];

/**
 * Valida el catálogo de poderes y lo devuelve tipado; lanza diciendo qué no
 * cuadra y de quién. Exportada con el JSON de argumento para que un test la vea
 * morder: el hechizo tiene que ir a un aliado; uno de curar lleva `cura` y uno de
 * suerte o velocidad lleva `rondas`, y nada más; uno de daño no es un poder.
 */
export function validarPoderes(
  json: unknown,
  fichero = 'data/poderes.json',
): {
  readonly poderes: readonly Poder[];
  readonly traen: Readonly<Record<string, readonly PoderId[]>>;
} {
  if (typeof json !== 'object' || json === null) throw new Error(`${fichero}: no es un objeto`);
  const j = json as Record<string, unknown>;
  if (!Array.isArray(j.poderes)) throw new Error(`${fichero}: «poderes» tiene que ser una lista`);
  const poderes = j.poderes.map((crudo: unknown, i): Poder => {
    if (typeof crudo !== 'object' || crudo === null) {
      throw new Error(`${fichero}: el poder ${i + 1} no es un objeto`);
    }
    const p = crudo as Record<string, unknown>;
    const id = texto(p.id, 'el id', `${fichero}: el poder ${i + 1}`);
    const quien = `${fichero}: el poder «${id}»`;
    const ajeno = Object.keys(p).find((k) => !CAMPOS_DEL_PODER.includes(k));
    if (ajeno !== undefined) throw new Error(`${quien}: «${ajeno}» no es un campo`);
    const nombre = texto(p.nombre, 'el nombre', quien);
    const habilidad = texto(p.habilidad, 'la habilidad', quien);
    const hechizo = spell(texto(p.hechizo, 'el hechizo', quien));
    if (hechizo.kind === 'damage') {
      throw new Error(`${quien}: «${hechizo.name}» es de daño, y un poder cura o deja un efecto`);
    }
    if (hechizo.target !== 'ally') {
      throw new Error(
        `${quien}: «${hechizo.name}» va a un enemigo, y un poder se usa sobre un aliado`,
      );
    }
    const base = { id, nombre, habilidad, hechizo };
    if (hechizo.kind === 'heal') {
      if (p.rondas !== undefined) {
        throw new Error(`${quien}: cura y no dura, así que no lleva «rondas»`);
      }
      return { ...base, lanzador: { cantidad: entero(p.cura, 'la cura', quien, 1), rondas: 0 } };
    }
    // Suerte o velocidad: dura unas rondas.
    if (p.cura !== undefined) {
      throw new Error(`${quien}: «${hechizo.name}» no cura, así que no lleva «cura»`);
    }
    return { ...base, lanzador: { cantidad: 0, rondas: entero(p.rondas, 'las rondas', quien, 1) } };
  });
  const ids = poderes.map((p) => p.id);
  const repetido = repetidoEn(ids);
  if (repetido !== undefined) throw new Error(`${fichero}: el poder «${repetido}» está dos veces`);
  const otra = repetidoEn(poderes.map((p) => p.habilidad));
  if (otra !== undefined) {
    throw new Error(`${fichero}: la habilidad «${otra}» da dos poderes`);
  }
  if (typeof j.traen !== 'object' || j.traen === null || Array.isArray(j.traen)) {
    throw new Error(`${fichero}: «traen» tiene que ser un objeto de hoja a lista de poderes`);
  }
  const traen: Record<string, readonly PoderId[]> = {};
  for (const [hoja, lista] of Object.entries(j.traen)) {
    if (!Array.isArray(lista)) throw new Error(`${fichero}: traen.${hoja} tiene que ser una lista`);
    for (const id of lista) {
      if (!ids.includes(id as string)) {
        throw new Error(
          `${fichero}: traen.${hoja}: «${String(id)}» no es un poder; valen ${ids.join(', ')}`,
        );
      }
    }
    traen[hoja] = lista as PoderId[];
  }
  return { poderes, traen };
}

const CATALOGO = validarPoderes(poderesJson);

/** El poder `id`. Lanza con uno que no existe: un id inventado es un fallo, no un vacío. */
export function poder(id: PoderId): Poder {
  const p = poderSiExiste(id);
  if (p === null) throw new Error(`poder desconocido: «${id}»`);
  return p;
}

/** Como `poder`, pero `null` en vez de lanzar: para dar un motivo a un id que llega de fuera. */
export function poderSiExiste(id: string): Poder | null {
  return CATALOGO.poderes.find((x) => x.id === id) ?? null;
}

/** ¿Cura este poder? (Curar sí; Bendecir deja un efecto.) */
export function esDeCura(p: Poder): boolean {
  return p.hechizo.kind === 'heal';
}

/** El poder que da una habilidad, o `null` si la habilidad no tiene efecto todavía. */
export function poderDeHabilidad(habilidad: string): PoderId | null {
  return CATALOGO.poderes.find((p) => p.habilidad === habilidad)?.id ?? null;
}

/** Las habilidades que dan un poder: las únicas de la arena que actúan en la pelea. */
export const HABILIDADES_CON_PODER: readonly string[] = CATALOGO.poderes.map((p) => p.habilidad);

/** Las habilidades que trae una hoja la primera vez (`traen`), o ninguna. */
export function habilidadesQueTrae(hoja: string): readonly string[] {
  return (CATALOGO.traen[hoja] ?? []).map((id) => poder(id).habilidad);
}
