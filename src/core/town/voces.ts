/**
 * La gente de una base y lo que dice.
 *
 * Quién hay sale de lo construido: un encargado por sitio con algo levantado y
 * los vecinos de la facción, que están siempre (`data/vecinos.json`). Lo que
 * dicen lo escribe el narrador con la petición `town_voices` y, si no lo ha
 * escrito —sin agente, o hasta que conteste—, cada uno dice una de sus frases de
 * respaldo, elegida con una tirada propia que no toca la corriente de azar de la
 * partida.
 *
 * **Es presentación, nunca regla**: nada de aquí cambia el juego ni escribe en la
 * crónica. Por eso `Town.voces` es un campo opcional que el banco no ve, y por
 * eso `ponerVoces` es su único escritor (lo vigila `invariantes.test.ts`).
 */
import vecinosJson from '../../../data/vecinos.json' with { type: 'json' };
import { motivoDeLinea } from '../contract/linea.js';
import { type Especie, etiquetaBlocker, type Oficio, type Sexo } from '../npcs.js';
import { createRng, hashDeTexto } from '../rng.js';
import { FACTION_IDS, type FactionId, type PlayerId } from '../types.js';
import { esSitio, SITIOS, type SitioId, sitiosConstruidos } from './sitios.js';
import type { Town } from './town.js';

/** Lo largo que puede ser una línea de un vecino. */
export const LARGO_DE_LINEA = 160;
/** Cuántas líneas puede narrar el agente por vecino. */
export const LINEAS_POR_VECINO = 3;
/**
 * Cuántas voces caben en una respuesta: las de cuatro bases enteras (doce
 * encargados y cuatro vecinos por base, con holgura).
 */
export const MAX_VOCES_POR_RESPUESTA = 48;

/**
 * Una persona de la base. Su figura sale del banco de NPC por sus etiquetas
 * (`figurasDeLaGente`, `town/figuras.ts`), que son las del vocabulario del banco
 * (`ETIQUETAS`, `core/npcs.ts`); hasta el 22-10-2026 llevaba un `cuerpo` del
 * catálogo que no se pintaba.
 */
export interface Persona {
  readonly nombre: string;
  readonly papel: string;
  readonly oficio: Oficio;
  readonly sexo: Sexo;
  readonly especie: Especie;
}

/** Una persona de la gente de una facción, con su id: `alcaide`, `encargado-<sitio>` o `vecino-<id>`. */
export interface PersonaDeLaFaccion extends Persona {
  readonly id: string;
}

export interface Vecino extends Persona {
  /** `encargado-<sitio>` o `vecino-<id>`: lo que el agente nombra en `npc`. */
  readonly id: string;
  /** El sitio del que es encargado, o `null` si es un vecino. */
  readonly sitio: SitioId | null;
  /**
   * Un vecino, su clave en `data/vecinos.json` (la misma de `data/bases/<f>.json`,
   * que dice dónde está); un encargado, `null`: está junto a la puerta de su sitio.
   */
  readonly clave: string | null;
  /** Las de respaldo. */
  readonly frases: readonly string[];
}

interface GenteDeFaccion {
  readonly alcaide: Persona;
  readonly encargados: Readonly<Record<SitioId, Persona & { readonly frases: readonly string[] }>>;
  readonly vecinos: Readonly<Record<string, Persona & { readonly frases: readonly string[] }>>;
}

/**
 * `data/vecinos.json`, comprobado al cargar: cada facción con su alcaide, un
 * encargado por sitio, las etiquetas de cada uno del vocabulario del banco de NPC y
 * al menos una frase. Un sitio sin encargado dejaría un edificio construido sin
 * nadie a la puerta.
 */
function cargarGente(): Readonly<Record<FactionId, GenteDeFaccion>> {
  const crudo = vecinosJson as unknown as Record<string, unknown>;
  const fuera = (faccion: string, quien: string, motivo: string): Error =>
    new Error(`data/vecinos.json: ${faccion}/${quien} ${motivo}`);
  const persona = (faccion: FactionId, quien: string, p: unknown, conFrases: boolean) => {
    const x = p as {
      nombre?: unknown;
      papel?: unknown;
      oficio?: unknown;
      sexo?: unknown;
      especie?: unknown;
      frases?: unknown;
    };
    if (typeof x?.nombre !== 'string' || x.nombre === '')
      throw fuera(faccion, quien, 'no tiene nombre');
    if (typeof x.papel !== 'string' || x.papel === '')
      throw fuera(faccion, quien, 'no tiene papel');
    for (const k of ['oficio', 'sexo', 'especie'] as const) {
      const motivo = etiquetaBlocker(k, x[k]);
      if (motivo !== null) throw fuera(faccion, quien, motivo);
    }
    const frases = x.frases;
    if (conFrases) {
      if (!Array.isArray(frases) || frases.length === 0) {
        throw fuera(faccion, quien, 'no tiene frases de respaldo');
      }
      for (const f of frases) {
        const motivo =
          typeof f === 'string' ? motivoDeLinea(f, LARGO_DE_LINEA, 'su frase') : 'no es texto';
        if (motivo !== null) throw fuera(faccion, quien, `tiene una frase que no vale: ${motivo}`);
      }
    }
    return {
      nombre: x.nombre,
      papel: x.papel,
      oficio: x.oficio as Oficio,
      sexo: x.sexo as Sexo,
      especie: x.especie as Especie,
      frases: (frases ?? []) as string[],
    };
  };

  const out = {} as Record<FactionId, GenteDeFaccion>;
  for (const faccion of FACTION_IDS) {
    const g = crudo[faccion] as
      | {
          alcaide?: unknown;
          encargados?: Record<string, unknown>;
          vecinos?: Record<string, unknown>;
        }
      | undefined;
    if (g === undefined) throw new Error(`data/vecinos.json: falta la gente de ${faccion}`);
    const encargados = {} as Record<SitioId, Persona & { frases: string[] }>;
    for (const sitio of SITIOS) {
      encargados[sitio] = persona(faccion, `encargados.${sitio}`, g.encargados?.[sitio], true);
    }
    for (const k of Object.keys(g.encargados ?? {})) {
      if (!esSitio(k))
        throw fuera(faccion, `encargados.${k}`, `no es un sitio: hay ${SITIOS.join(', ')}`);
    }
    const vecinos: Record<string, Persona & { frases: string[] }> = {};
    for (const [id, v] of Object.entries(g.vecinos ?? {})) {
      if (!/^[a-z0-9_-]+$/.test(id))
        throw fuera(
          faccion,
          `vecinos.${id}`,
          'no es un id: minúsculas, dígitos, guion y guion bajo',
        );
      vecinos[id] = persona(faccion, `vecinos.${id}`, v, true);
    }
    const { frases: _sinFrases, ...alcaide } = persona(faccion, 'alcaide', g.alcaide, false);
    out[faccion] = { alcaide, encargados, vecinos };
  }
  return out;
}

const GENTE = cargarGente();

/** Quien camina por la base cuando no hay un héroe dentro. */
export function alcaideDe(faccion: FactionId): Persona {
  return GENTE[faccion].alcaide;
}

/**
 * Toda la gente de una facción, en un orden fijo: el alcaide, los doce encargados
 * (en el de `SITIOS`, se vean o no) y los vecinos. Es la lista que se reparte las
 * figuras del banco (`figurasDeLaGente`: construir un sitio no le cambia la cara a
 * nadie), la que lee el motor de narrativa para asignarlas y la que admite
 * `historia.base`.
 */
export function personasDeLaFaccion(faccion: FactionId): readonly PersonaDeLaFaccion[] {
  const g = GENTE[faccion];
  const sinFrases = ({ nombre, papel, oficio, sexo, especie }: Persona): Persona => ({
    nombre,
    papel,
    oficio,
    sexo,
    especie,
  });
  return [
    { id: ID_DEL_ALCAIDE, ...sinFrases(g.alcaide) },
    ...SITIOS.map((s) => ({ id: idDeEncargado(s), ...sinFrases(g.encargados[s]) })),
    ...Object.entries(g.vecinos).map(([k, v]) => ({ id: idDeVecino(k), ...sinFrases(v) })),
  ];
}

/**
 * Los ids de la gente de una base: los que nombran la conversación, el agente
 * (`npc` de las voces), las figuras (`figurasDeLaGente`) y `historia.base`. Nadie
 * más los escribe.
 */
export const ID_DEL_ALCAIDE = 'alcaide';
export const idDeEncargado = (sitio: SitioId): string => `encargado-${sitio}`;
export const idDeVecino = (clave: string): string => `vecino-${clave}`;

/** Los ids de los vecinos de una facción, los de `data/vecinos.json`. */
export function idsDeVecinos(faccion: FactionId): readonly string[] {
  return Object.keys(GENTE[faccion].vecinos);
}

/** Quién hay en la base: un encargado por sitio construido, y los vecinos. */
export function vecinosDeLaBase(town: Town): readonly Vecino[] {
  const g = GENTE[town.faction];
  return [
    ...sitiosConstruidos(town).map((sitio) => ({
      id: idDeEncargado(sitio),
      sitio,
      clave: null,
      ...g.encargados[sitio],
    })),
    ...Object.entries(g.vecinos).map(([clave, v]) => ({
      id: idDeVecino(clave),
      sitio: null,
      clave,
      ...v,
    })),
  ];
}

/**
 * Cuándo caducan las voces de una base: una semana nueva o un sitio que se
 * levanta por primera vez (un encargado nuevo a quien poner voz). Mejorar lo que
 * ya está no las caduca.
 *
 * Con «cualquier edificio nuevo» salía un `town_voices` por cada turno del
 * agente en `pnpm qa` (6 para 6 `adventure_turn`, 09-10-2026): el agente
 * construye casi cada día y la petición doblaba las suyas, que es el riesgo que
 * señaló la crítica. Por sitios, ver `implementacion.md`.
 */
export function firmaDeVoces(town: Town, semana: number): string {
  return `semana ${semana}: ${sitiosConstruidos(town).join(',')}`;
}

/** Si hay que pedirle al narrador las voces de esta base. */
export function vocesCaducadas(town: Town, semana: number): boolean {
  return town.voces?.firma !== firmaDeVoces(town, semana);
}

/**
 * Lo que dice `npc` hoy: su línea narrada del día, si el narrador escribió
 * alguna, o una de sus frases de respaldo. La tirada de respaldo sale de su base,
 * su id, la semana y el día, con su propio `createRng`: la misma persona dice lo
 * mismo todo el día y la partida no cambia por preguntarle. Lanza si en esa base
 * no hay nadie con ese id.
 */
export function vozDe(town: Town, npc: string, semana: number, dia: number): string {
  const vecino = vecinosDeLaBase(town).find((v) => v.id === npc);
  if (vecino === undefined) {
    throw new Error(`en ${town.name} no hay nadie que se llame "${npc}"`);
  }
  const narradas = town.voces?.lineas[npc];
  if (narradas !== undefined && narradas.length > 0) {
    return narradas[dia % narradas.length] as string;
  }
  return createRng(hashDeTexto(`${town.id}|${npc}|${semana}|${dia}`)).pick(vecino.frases);
}

/** Por qué no se pueden poner voces a `npc` en esta base, o `null` si se puede. */
export function vocesBlocker(town: Town, player: PlayerId, npc: string): string | null {
  if (town.owner !== player) return `${town.name} no es una base tuya`;
  const gente = vecinosDeLaBase(town);
  if (!gente.some((v) => v.id === npc)) {
    return `en ${town.name} no hay nadie que se llame "${npc}": están ${gente.map((v) => v.id).join(', ')}`;
  }
  return null;
}

export interface VozPedida {
  readonly npc: string;
  readonly lines: readonly string[];
}

export interface VocesPuestas {
  /** Las líneas que entraron. */
  readonly aceptadas: number;
  /** Lo que no entró, uno por voz o por línea, con su motivo. */
  readonly rechazos: readonly string[];
}

/**
 * Pone las voces que el narrador escribió para una base. Es el **único** que
 * escribe `town.voces`.
 *
 * Cada voz se juzga sola y cada línea dentro de ella también: un vecino que no
 * existe se rechaza sin tirar los demás, y una línea con un salto se rechaza sin
 * tirar las otras dos de su vecino. Las voces de antes se sustituyen enteras —el
 * narrador las escribe para la firma de ahora— y quien se queda sin línea vuelve
 * a sus frases de respaldo. La firma se apunta aunque no entre nada, para no
 * volver a preguntar hasta que cambie la base o la semana.
 */
export function ponerVoces(
  town: Town,
  player: PlayerId,
  semana: number,
  voces: readonly VozPedida[],
): VocesPuestas {
  const rechazos: string[] = [];
  const lineas: Record<string, string[]> = {};
  let aceptadas = 0;
  for (const voz of voces) {
    const motivo = vocesBlocker(town, player, voz.npc);
    if (motivo !== null) {
      rechazos.push(`${voz.npc}: ${motivo}`);
      continue;
    }
    if (lineas[voz.npc] !== undefined) {
      rechazos.push(`${voz.npc}: ya tiene sus líneas más arriba en esta misma respuesta`);
      continue;
    }
    if (voz.lines.length > LINEAS_POR_VECINO) {
      rechazos.push(
        `${voz.npc}: lleva ${voz.lines.length} líneas y el máximo es ${LINEAS_POR_VECINO}`,
      );
      continue;
    }
    const buenas: string[] = [];
    voz.lines.forEach((linea, i) => {
      const m = motivoDeLinea(linea, LARGO_DE_LINEA, 'la línea');
      if (m === null) buenas.push(linea);
      else rechazos.push(`${voz.npc}, línea ${i + 1}: ${m}`);
    });
    if (buenas.length > 0) {
      lineas[voz.npc] = buenas;
      aceptadas += buenas.length;
    }
  }
  town.voces = { firma: firmaDeVoces(town, semana), lineas };
  return { aceptadas, rechazos };
}
