/**
 * La validación de un mundo: **la única**, para `pnpm mundo validar <id>`, el
 * servidor de desarrollo que lo genera, la página que lo carga y `newGame`.
 *
 * Devuelve **todos** los problemas de una vez, cada uno con su ruta dentro del
 * fichero y escrito para el motor de narrativa, que es quien tiene que corregirlo
 * (`historia.json: lugares[1].dialogos.corvo.nodos.pagar.opciones[0].hace[1]: la
 * pieza «docuemnto» no existe`). Es el patrón de `validateMapPlan`: el motor itera
 * con la lista hasta que sale vacía, y lo que no puede comprobar él (si una
 * casilla admite un lugar, si un árbol llega a todos sus nodos, si una pieza
 * existe) se deriva aquí.
 *
 * A mano y en español, como `validarUnidad` y `leerPiezas`, sin zod: los mensajes
 * de zod salen en inglés y el trozo de la página no lo necesita.
 */
import { problemasDeGrupo, unidadDelJuegoSiExiste } from '../catalogo.js';
import { motivoDeLinea } from '../contract/linea.js';
import { problemaDeTipo } from '../hero/ascenso.js';
import { piezaSiExiste } from '../hero/equipo.js';
import { CUPO_HEROE } from '../hero/troop.js';
import { basesDelPlan, buildMap, type MapPlan, validateMapPlan } from '../map/generate.js';
import { type GameMap, inBounds, isEnterable, type MapObject, terrainAt } from '../map/map.js';
import { FUERA, pasosDelMapa, queEsElObjeto } from '../map/recinto.js';
import { problemasDeGrupoNeutral, regionDeCasilla } from '../state/asaltantes.js';
import { esFaccion, FACTION_IDS, type FactionId, type Point } from '../types.js';
import {
  CLAVES_DE_CONDICION,
  CLAVES_DE_EFECTO,
  type ClaveDeEfecto,
  type Condicion,
  EFECTOS_AL_GANAR,
  EFECTOS_AL_PERDER,
  type Efecto,
  type EstadoDelMundo,
  esIdDeHistoria,
  esIdDeMundo,
  type Historia,
  type Lugar,
  type Mundo,
  type MundoLeido,
  VERSION_DEL_MUNDO,
} from './formato.js';

/** A cuántas casillas (Chebyshev) va un lugar, como poco, de todo objeto del mapa y de otro lugar. */
export const SEPARACION_DE_UN_LUGAR = 3;
/** Cuántos lugares lleva un mundo como mucho. */
export const LUGARES_MAXIMOS = 8;

/** Lo largo de cada texto de una historia, en caracteres. */
export const LARGO = {
  titulo: 80,
  resumen: 400,
  nombre: 60,
  texto: 400,
  opcion: 120,
  marca: 160,
} as const;

/**
 * Por qué no puede ir un lugar en `at`, o `null`: dentro del mapa, en algo que se
 * pisa, dentro de una región (ni nodo, ni barrera, ni el río), fuera de todo
 * recinto de ciudad y a `SEPARACION_DE_UN_LUGAR` o más de todo objeto del mapa
 * —con sus puertas y sus reservas, que caben en ese radio— y de los lugares
 * `otros`. Sin camino nuevo hasta él (P3 del usuario). La leen la validación del
 * mundo y la lectura para el motor, que le da casillas de muestra que la pasan.
 */
export function lugarBlocker(
  map: GameMap,
  at: Point,
  otros: readonly { readonly at: Point; readonly name: string }[] = [],
): string | null {
  const donde = `(${at.x}, ${at.y})`;
  if (!inBounds(map, at)) {
    return `${donde} está fuera del mapa, que mide ${map.width} × ${map.height}`;
  }
  const rol = pasosDelMapa(map)?.rol[at.y * map.width + at.x] ?? FUERA;
  if (rol !== FUERA) return `${donde} está en el recinto de una ciudad: un lugar va fuera`;
  if (!isEnterable(map, at)) return `${donde} es ${terrainAt(map, at)}, y eso no se pisa`;
  if (regionDeCasilla(map, at) < 0) {
    return `${donde} no está dentro de ninguna región: es un paso entre dos, y un lugar va dentro de una`;
  }
  const cerca = (p: Point): number => Math.max(Math.abs(p.x - at.x), Math.abs(p.y - at.y));
  for (const o of map.objects) {
    const d = cerca(o.at);
    if (d < SEPARACION_DE_UN_LUGAR) {
      return `${donde} está a ${d} ${deLo(queEsElObjeto(o))} en (${o.at.x}, ${o.at.y}): un lugar va a ${SEPARACION_DE_UN_LUGAR} casillas o más de todo objeto del mapa`;
    }
  }
  for (const o of otros) {
    const d = cerca(o.at);
    if (d < SEPARACION_DE_UN_LUGAR) {
      return `${donde} está a ${d} del lugar "${o.name}" en (${o.at.x}, ${o.at.y}): dos lugares van a ${SEPARACION_DE_UN_LUGAR} casillas o más`;
    }
  }
  return null;
}

/** «de» con lo que sigue, contraído: «del pueblo», «de la ciudad». */
function deLo(s: string): string {
  return s.startsWith('el ') ? `del ${s.slice(3)}` : `de ${s}`;
}

// ---------------------------------------------------------------- piezas del juez

/** Quien juzga: apunta problemas con su ruta. */
class Juez {
  readonly problemas: string[] = [];
  constructor(private readonly fichero: string) {}
  mal(ruta: string, motivo: string): void {
    this.problemas.push(`${this.fichero}: ${ruta === '' ? '' : `${ruta}: `}${motivo}`);
  }
}

function esObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Un objeto con esos campos: dice lo que sobra y lo que falta. `null` si no es un objeto. */
function objeto(
  j: Juez,
  v: unknown,
  ruta: string,
  obligatorios: readonly string[],
  opcionales: readonly string[] = [],
): Record<string, unknown> | null {
  if (!esObjeto(v)) {
    j.mal(
      ruta,
      `tiene que ser un objeto {…}, y es ${Array.isArray(v) ? 'una lista' : JSON.stringify(v)}`,
    );
    return null;
  }
  const valen = [...obligatorios, ...opcionales];
  for (const k of Object.keys(v)) {
    if (!valen.includes(k)) j.mal(ruta, `«${k}» no es un campo; valen ${valen.join(', ')}`);
  }
  for (const k of obligatorios) if (!(k in v)) j.mal(ruta, `falta «${k}»`);
  return v;
}

/** Un texto legible de una línea, de hasta `max` caracteres. */
function texto(j: Juez, v: unknown, ruta: string, max: number): string | null {
  if (typeof v !== 'string') {
    j.mal(ruta, 'tiene que ser un texto');
    return null;
  }
  const motivo = motivoDeLinea(v, max, 'el texto');
  if (motivo !== null) {
    j.mal(ruta, motivo);
    return null;
  }
  return v;
}

function id(j: Juez, v: unknown, ruta: string): string | null {
  if (typeof v !== 'string' || !esIdDeHistoria(v)) {
    j.mal(ruta, `${JSON.stringify(v)} no es un id: minúsculas, cifras, «-» y «_», de 1 a 48`);
    return null;
  }
  return v;
}

function entero(j: Juez, v: unknown, ruta: string, min: number, max: number): number | null {
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < min || v > max) {
    j.mal(ruta, `tiene que ser un entero de ${min} a ${max}, y es ${JSON.stringify(v)}`);
    return null;
  }
  return v;
}

function lista(j: Juez, v: unknown, ruta: string): readonly unknown[] {
  if (!Array.isArray(v)) {
    j.mal(ruta, 'tiene que ser una lista […]');
    return [];
  }
  return v;
}

/** Un objeto usado como diccionario: sus claves, ids. */
function registro(j: Juez, v: unknown, ruta: string): [string, unknown][] {
  if (!esObjeto(v)) {
    j.mal(ruta, 'tiene que ser un objeto {"<id>": …}');
    return [];
  }
  return Object.entries(v).filter(([k]) => id(j, k, `${ruta}.${k}`) !== null);
}

function punto(j: Juez, v: unknown, ruta: string): Point | null {
  const o = objeto(j, v, ruta, ['x', 'y']);
  if (o === null) return null;
  const x = entero(j, o.x, `${ruta}.x`, 0, 10_000);
  const y = entero(j, o.y, `${ruta}.y`, 0, 10_000);
  return x === null || y === null ? null : { x, y };
}

function faccion(j: Juez, v: unknown, ruta: string): FactionId | null {
  if (typeof v !== 'string' || !esFaccion(v)) {
    j.mal(ruta, `${JSON.stringify(v)} no es una facción; valen ${FACTION_IDS.join(', ')}`);
    return null;
  }
  return v;
}

// ---------------------------------------------------------------- el mundo

/** Los tres ficheros de un mundo, tal cual del disco. */
export interface CrudosDelMundo {
  readonly mundo: unknown;
  readonly plan: unknown;
  readonly historia: unknown;
}

/** Lo que una historia necesita saber del resto del mundo para juzgarse entera. */
export interface ContextoDeLaHistoria {
  /** El mapa construido del plan, donde van los lugares. */
  readonly map: GameMap;
  /** La facción de quien juega (la del jugador 0). */
  readonly faccionDelJugador: FactionId;
}

/**
 * Todos los problemas de un mundo, con su fichero y su ruta. Vacío: se juega.
 * `id` es el de su carpeta, que el `mundo.json` tiene que repetir.
 */
export function problemasDelMundo(crudos: CrudosDelMundo, idEsperado: string): string[] {
  const problemas: string[] = [];
  if (!esIdDeMundo(idEsperado)) {
    problemas.push(`"${idEsperado}" no es el id de un mundo: minúsculas, cifras y «-», de 1 a 48`);
  }
  const mundo = juzgarMundoJson(crudos.mundo, idEsperado, problemas);
  const { map, faccion0 } = juzgarPlan(crudos.plan, problemas);
  if (mundo !== null && faccion0 !== null && mundo.jugador.faccion !== faccion0) {
    problemas.push(
      `mundo.json: jugador.faccion es ${mundo.jugador.faccion} y la base del jugador 0 del plan es de ${faccion0}`,
    );
  }
  const ctx =
    map === null
      ? null
      : { map, faccionDelJugador: mundo?.jugador.faccion ?? faccion0 ?? 'imperio' };
  problemas.push(...problemasDeLaHistoria(crudos.historia, ctx));
  return problemas;
}

/** El mundo leído, o lanza con todos sus problemas (la página lo pinta: `arranque.ts`). */
export function leerMundo(crudos: CrudosDelMundo, idEsperado: string): MundoLeido {
  const problemas = problemasDelMundo(crudos, idEsperado);
  if (problemas.length > 0) {
    throw new Error(
      `el mundo "${idEsperado}" no se puede jugar (${problemas.length} problema${problemas.length === 1 ? '' : 's'}):\n- ${problemas.join('\n- ')}`,
    );
  }
  return {
    mundo: crudos.mundo as Mundo,
    plan: crudos.plan,
    historia: crudos.historia as Historia,
  };
}

function juzgarMundoJson(crudo: unknown, idEsperado: string, problemas: string[]): Mundo | null {
  const j = new Juez('mundo.json');
  const o = objeto(j, crudo, '', [
    'version',
    'id',
    'semilla',
    'jugador',
    'rivales',
    'regionesPorBando',
  ]);
  if (o !== null) {
    if (o.version !== VERSION_DEL_MUNDO) {
      j.mal(
        'version',
        `es ${JSON.stringify(o.version)} y este juego lee la ${VERSION_DEL_MUNDO}: vuelve a generar el mundo`,
      );
    }
    if (o.id !== idEsperado) {
      j.mal('id', `dice ${JSON.stringify(o.id)} y el mundo está en la carpeta "${idEsperado}"`);
    }
    entero(j, o.semilla, 'semilla', 0, 0xffff_ffff);
    const jug = objeto(j, o.jugador, 'jugador', ['faccion', 'heroe']);
    if (jug !== null) {
      const f = faccion(j, jug.faccion, 'jugador.faccion');
      if (typeof jug.heroe !== 'string') j.mal('jugador.heroe', 'tiene que ser un texto');
      else if (f !== null) {
        const malo = problemaDeTipo(f, jug.heroe);
        if (malo !== null) j.mal('jugador.heroe', malo);
      }
    }
    if (o.rivales !== 1) {
      j.mal(
        'rivales',
        `es ${JSON.stringify(o.rivales)}: este juego aún juega contra un solo rival (el generador no sabe de más bandos)`,
      );
    }
    entero(j, o.regionesPorBando, 'regionesPorBando', 2, 20);
  }
  problemas.push(...j.problemas);
  return j.problemas.length === 0 ? (crudo as Mundo) : null;
}

function juzgarPlan(
  crudo: unknown,
  problemas: string[],
): { readonly map: GameMap | null; readonly faccion0: FactionId | null } {
  const nada = { map: null, faccion0: null };
  if (!esObjeto(crudo)) {
    problemas.push('plan.json: tiene que ser el objeto de un plan de mapa');
    return nada;
  }
  for (const k of ['regions', 'walls', 'nodes', 'towns', 'villages', 'monsters', 'chests']) {
    if (!Array.isArray(crudo[k])) {
      problemas.push(`plan.json: «${k}» tiene que ser una lista: no es el plan de un mapa`);
      return nada;
    }
  }
  const plan = crudo as unknown as MapPlan;
  try {
    const delPlan = validateMapPlan(plan);
    if (delPlan.length > 0) {
      problemas.push(...delPlan.map((p) => `plan.json: ${p}`));
      return nada;
    }
    const bases = basesDelPlan(plan);
    if (bases.size !== 2 || !bases.has(0) || !bases.has(1)) {
      problemas.push(
        `plan.json: tiene las bases de ${[...bases.keys()].join(', ') || 'nadie'} y un mundo de hoy es de los jugadores 0 y 1`,
      );
      return nada;
    }
    return { map: buildMap(plan).map, faccion0: (bases.get(0) as { faction: FactionId }).faction };
  } catch (err) {
    problemas.push(`plan.json: no se puede construir: ${err instanceof Error ? err.message : err}`);
    return nada;
  }
}

// ---------------------------------------------------------------- la historia

/** Lo que se sabe de un lugar mientras se juzga: lo que sus opciones pueden nombrar. */
interface DelLugar {
  readonly estados: ReadonlySet<string>;
  readonly encuentros: ReadonlySet<string>;
}

/** Lo que se va apuntando de toda la historia para mirarlo al final. */
interface Apuntes {
  readonly marcas: ReadonlySet<string>;
  readonly marcasPuestas: Set<string>;
}

/**
 * Los problemas de un `historia.json`. Con `ctx`, también lo que depende del mapa
 * (la casilla de cada lugar); sin él (el plan no se pudo construir), solo lo suyo.
 * La llama también `newGame` con una historia ya escrita, para que un estado de
 * partida no pueda nacer con una que la página rechazaría.
 */
export function problemasDeLaHistoria(crudo: unknown, ctx: ContextoDeLaHistoria | null): string[] {
  const j = new Juez('historia.json');
  const o = objeto(j, crudo, '', ['titulo', 'resumen', 'marcas', 'lugares']);
  if (o === null) return j.problemas;
  texto(j, o.titulo, 'titulo', LARGO.titulo);
  texto(j, o.resumen, 'resumen', LARGO.resumen);

  const marcas = new Set<string>();
  for (const [k, v] of registro(j, o.marcas, 'marcas')) {
    const m = objeto(j, v, `marcas.${k}`, ['falta', 'ya']);
    if (m !== null) {
      texto(j, m.falta, `marcas.${k}.falta`, LARGO.marca);
      texto(j, m.ya, `marcas.${k}.ya`, LARGO.marca);
    }
    marcas.add(k);
  }
  const apuntes: Apuntes = { marcas, marcasPuestas: new Set() };

  const lugares = lista(j, o.lugares, 'lugares');
  if (Array.isArray(o.lugares) && lugares.length === 0) {
    j.mal('lugares', 'no hay ninguno: un mundo lleva de 1 a 8 lugares');
  }
  if (lugares.length > LUGARES_MAXIMOS) {
    j.mal('lugares', `son ${lugares.length} y un mundo lleva como mucho ${LUGARES_MAXIMOS}`);
  }
  const ids = new Set<string>();
  const colocados: { at: Point; name: string }[] = [];
  lugares.forEach((l, i) => {
    const hecho = juzgarLugar(j, l, `lugares[${i}]`, apuntes);
    if (hecho === null) return;
    if (ids.has(hecho.id)) j.mal(`lugares[${i}].id`, `"${hecho.id}" ya es el id de otro lugar`);
    ids.add(hecho.id);
    if (ctx === null || hecho.at === null) return;
    const choca = ctx.map.objects.find((x) => x.id === hecho.id);
    if (choca !== undefined) {
      j.mal(`lugares[${i}].id`, `"${hecho.id}" ya es el id ${deLo(queEsElObjeto(choca))} del mapa`);
    }
    const motivo = lugarBlocker(ctx.map, hecho.at, colocados);
    if (motivo !== null) j.mal(`lugares[${i}].at`, motivo);
    colocados.push({ at: hecho.at, name: hecho.nombre });
  });

  for (const m of marcas) {
    if (!apuntes.marcasPuestas.has(m)) {
      j.mal(
        `marcas.${m}`,
        'ningún efecto la pone, así que ninguna condición sobre ella cambia nunca',
      );
    }
  }
  return j.problemas;
}

function juzgarLugar(
  j: Juez,
  v: unknown,
  ruta: string,
  apuntes: Apuntes,
): { readonly id: string; readonly nombre: string; readonly at: Point | null } | null {
  const o = objeto(j, v, ruta, [
    'id',
    'nombre',
    'at',
    'fondo',
    'estados',
    'estadoInicial',
    'puntos',
    'dialogos',
    'encuentros',
  ]);
  if (o === null) return null;
  const idDelLugar = id(j, o.id, `${ruta}.id`);
  const nombre = texto(j, o.nombre, `${ruta}.nombre`, LARGO.nombre);
  const at = punto(j, o.at, `${ruta}.at`);
  const fondo = objeto(j, o.fondo, `${ruta}.fondo`, ['plaza']);
  if (fondo !== null) faccion(j, fondo.plaza, `${ruta}.fondo.plaza`);

  const estados = new Set<string>();
  for (const [k, nom] of registro(j, o.estados, `${ruta}.estados`)) {
    texto(j, nom, `${ruta}.estados.${k}`, LARGO.nombre);
    estados.add(k);
  }
  if (estados.size === 0) j.mal(`${ruta}.estados`, 'no hay ninguno: un lugar tiene al menos uno');
  if (typeof o.estadoInicial !== 'string' || !estados.has(o.estadoInicial)) {
    j.mal(
      `${ruta}.estadoInicial`,
      `${JSON.stringify(o.estadoInicial)} no es uno de sus estados (${[...estados].join(', ')})`,
    );
  }

  // Los encuentros, antes que los diálogos: sus opciones los nombran.
  const encuentrosCrudos = registro(j, o.encuentros, `${ruta}.encuentros`);
  const delLugar: DelLugar = {
    estados,
    encuentros: new Set(encuentrosCrudos.map(([k]) => k)),
  };
  const alGanar = new Map<string, readonly Efecto[]>();
  for (const [k, e] of encuentrosCrudos) {
    const r = `${ruta}.encuentros.${k}`;
    const enc = objeto(j, e, r, ['nombre', 'tropa', 'alGanar', 'alPerder']);
    if (enc === null) continue;
    texto(j, enc.nombre, `${r}.nombre`, LARGO.nombre);
    const tropa = lista(j, enc.tropa, `${r}.tropa`).map((g, n) => {
      const og = objeto(j, g, `${r}.tropa[${n}]`, ['creature', 'count']);
      return { creature: String(og?.creature ?? ''), count: Number(og?.count ?? 0) };
    });
    if (Array.isArray(enc.tropa)) {
      for (const p of problemasDeGrupoNeutral(tropa, 'su tropa', 'un encuentro'))
        j.mal(`${r}.tropa`, p);
    }
    const g = efectos(j, enc.alGanar, `${r}.alGanar`, delLugar, apuntes, EFECTOS_AL_GANAR);
    efectos(j, enc.alPerder, `${r}.alPerder`, delLugar, apuntes, EFECTOS_AL_PERDER);
    alGanar.set(k, g);
  }

  const dialogos = new Map<string, Record<string, unknown>>();
  for (const [k, d] of registro(j, o.dialogos, `${ruta}.dialogos`)) {
    const od = objeto(j, d, `${ruta}.dialogos.${k}`, ['inicio', 'nodos']);
    if (od !== null) dialogos.set(k, od);
  }
  const usadoPor = new Map<string, string>();
  const encuentrosUsados = new Set<string>();
  const puntos = lista(j, o.puntos, `${ruta}.puntos`);
  if (Array.isArray(o.puntos) && puntos.length === 0) {
    j.mal(
      `${ruta}.puntos`,
      'no hay ninguno: sin puntos de interés, en el lugar no hay nada que hacer',
    );
  }
  const idsDePunto = new Set<string>();
  puntos.forEach((p, i) => {
    const r = `${ruta}.puntos[${i}]`;
    const op = objeto(j, p, r, ['id', 'x', 'dialogo'], ['si', 'persona', 'cosa']);
    if (op === null) return;
    const idp = id(j, op.id, `${r}.id`);
    if (idp !== null) {
      if (idsDePunto.has(idp)) j.mal(`${r}.id`, `"${idp}" ya es el id de otro punto de este lugar`);
      idsDePunto.add(idp);
    }
    if (typeof op.x !== 'number' || !(op.x >= 0 && op.x <= 1)) {
      j.mal(
        `${r}.x`,
        `tiene que ser un número de 0 (la izquierda) a 1 (la derecha), y es ${JSON.stringify(op.x)}`,
      );
    }
    const siDelPunto = condiciones(j, op.si, `${r}.si`, delLugar, apuntes);
    if ('persona' in op === 'cosa' in op) {
      j.mal(r, 'lleva «persona» o «cosa», una de las dos');
    } else if ('persona' in op) {
      const per = objeto(j, op.persona, `${r}.persona`, ['nombre', 'papel', 'cuerpo']);
      if (per !== null) {
        texto(j, per.nombre, `${r}.persona.nombre`, LARGO.nombre);
        texto(j, per.papel, `${r}.persona.papel`, LARGO.nombre);
        if (typeof per.cuerpo !== 'string' || unidadDelJuegoSiExiste(per.cuerpo) === null) {
          j.mal(
            `${r}.persona.cuerpo`,
            `${JSON.stringify(per.cuerpo)} no es una unidad del catálogo: su figura sale de ahí`,
          );
        }
      }
    } else {
      const cosa = objeto(j, op.cosa, `${r}.cosa`, ['nombre']);
      if (cosa !== null) texto(j, cosa.nombre, `${r}.cosa.nombre`, LARGO.nombre);
    }
    if (typeof op.dialogo !== 'string' || !dialogos.has(op.dialogo)) {
      j.mal(
        `${r}.dialogo`,
        `${JSON.stringify(op.dialogo)} no es uno de los diálogos del lugar (${[...dialogos.keys()].join(', ') || 'ninguno'})`,
      );
      return;
    }
    // Cada punto lleva su diálogo: la regla de la opción que se apaga mira el «si»
    // del punto, y con dos puntos en el mismo diálogo, el que no lo lleva cobraría
    // otra vez lo que el otro ya dio.
    const dueño = usadoPor.get(op.dialogo);
    if (dueño !== undefined) {
      j.mal(
        `${r}.dialogo`,
        `"${op.dialogo}" ya es el diálogo del punto "${dueño}": cada punto lleva el suyo`,
      );
      return;
    }
    usadoPor.set(op.dialogo, String(op.id));
    juzgarDialogo(
      j,
      dialogos.get(op.dialogo) as Record<string, unknown>,
      `${ruta}.dialogos.${op.dialogo}`,
      {
        delLugar,
        apuntes,
        siDelPunto,
        alGanar,
        encuentrosUsados,
      },
    );
  });
  for (const k of dialogos.keys()) {
    if (!usadoPor.has(k)) j.mal(`${ruta}.dialogos.${k}`, 'no lo usa ningún punto');
  }
  for (const k of delLugar.encuentros) {
    if (!encuentrosUsados.has(k)) j.mal(`${ruta}.encuentros.${k}`, 'no lo abre ninguna opción');
  }
  return idDelLugar === null || nombre === null ? null : { id: idDelLugar, nombre, at };
}

interface DelDialogo {
  readonly delLugar: DelLugar;
  readonly apuntes: Apuntes;
  readonly siDelPunto: readonly Condicion[];
  readonly alGanar: ReadonlyMap<string, readonly Efecto[]>;
  readonly encuentrosUsados: Set<string>;
}

function juzgarDialogo(j: Juez, d: Record<string, unknown>, ruta: string, ctx: DelDialogo): void {
  const nodos = new Map(registro(j, d.nodos, `${ruta}.nodos`));
  if (typeof d.inicio !== 'string' || !nodos.has(d.inicio)) {
    j.mal(
      `${ruta}.inicio`,
      `${JSON.stringify(d.inicio)} no es uno de sus nodos (${[...nodos.keys()].join(', ') || 'ninguno'})`,
    );
  }
  const lleva = new Map<string, string[]>();
  for (const [k, n] of nodos) {
    const r = `${ruta}.nodos.${k}`;
    const on = objeto(j, n, r, ['texto', 'opciones']);
    if (on === null) continue;
    texto(j, on.texto, `${r}.texto`, LARGO.texto);
    const opciones = lista(j, on.opciones, `${r}.opciones`);
    if (Array.isArray(on.opciones) && opciones.length === 0) {
      j.mal(`${r}.opciones`, 'no hay ninguna: la conversación se quedaría ahí sin salida');
    }
    const destinos: string[] = [];
    opciones.forEach((op, i) => {
      const ro = `${r}.opciones[${i}]`;
      const oo = objeto(j, op, ro, ['texto'], ['si', 'hace', 'ir']);
      if (oo === null) return;
      texto(j, oo.texto, `${ro}.texto`, LARGO.opcion);
      const si = condiciones(j, oo.si, `${ro}.si`, ctx.delLugar, ctx.apuntes);
      const hace = efectos(j, oo.hace, `${ro}.hace`, ctx.delLugar, ctx.apuntes, CLAVES_DE_EFECTO);
      if ('ir' in oo) {
        if (typeof oo.ir !== 'string' || !nodos.has(oo.ir)) {
          j.mal(`${ro}.ir`, `${JSON.stringify(oo.ir)} no es uno de los nodos de este diálogo`);
        } else destinos.push(oo.ir);
      }
      for (const e of hace) if ('batalla' in e) ctx.encuentrosUsados.add(e.batalla);
      const motivo = noSeApaga([...ctx.siDelPunto, ...si], hace, ctx.alGanar);
      if (motivo !== null) j.mal(ro, motivo);
    });
    lleva.set(k, destinos);
  }
  // Todo nodo se alcanza desde el inicio: uno suelto es texto que nadie lee.
  if (typeof d.inicio === 'string' && nodos.has(d.inicio)) {
    const vistos = new Set([d.inicio]);
    const cola = [d.inicio];
    while (cola.length > 0) {
      for (const sig of lleva.get(cola.shift() as string) ?? []) {
        if (!vistos.has(sig)) {
          vistos.add(sig);
          cola.push(sig);
        }
      }
    }
    for (const k of nodos.keys()) {
      if (!vistos.has(k))
        j.mal(`${ruta}.nodos.${k}`, `no se llega a él desde el inicio («${d.inicio}»)`);
    }
  }
}

/**
 * La regla de la opción que se apaga (P-c del usuario): si da algo —oro, una
 * pieza, tropa— o abre una batalla, lo que aplica (sus efectos y, si pelea, los de
 * ganar) tiene que dejar de cumplir alguna de sus condiciones (las suyas o las de su
 * punto). Si no, la persona y la IA la elegirían una vez tras otra y cada premio se
 * cobraría sin fin. `null`: se apaga, o no da nada.
 */
function noSeApaga(
  si: readonly Condicion[],
  hace: readonly Efecto[],
  alGanar: ReadonlyMap<string, readonly Efecto[]>,
): string | null {
  const batalla = hace.find((e): e is { batalla: string } => 'batalla' in e);
  const da = hace.some(
    (e) => ('oro' in e && e.oro > 0) || 'pieza' in e || 'tropa' in e || 'batalla' in e,
  );
  if (!da) return null;
  const aplica = [...hace, ...(batalla === undefined ? [] : (alGanar.get(batalla.batalla) ?? []))];
  if (si.some((c) => loApaga(c, aplica))) return null;
  const que = batalla === undefined ? 'da algo' : 'abre una batalla';
  return `${que} y no se apaga a sí misma: sus efectos${batalla === undefined ? '' : ' o los de «alGanar»'} tienen que cambiar el estado del lugar o poner una marca que su «si» (o el de su punto) deje de cumplir; si no, se cobraría cada vez`;
}

/** Si aplicar `efectos` deja de cumplir `c`. */
function loApaga(c: Condicion, efectos: readonly Efecto[]): boolean {
  if ('estado' in c) return efectos.some((e) => 'estado' in e && e.estado !== c.estado);
  if ('lleva' in c) return efectos.some((e) => 'quitar' in e && e.quitar === c.lleva);
  if ('no' in c) {
    const n = c.no;
    if ('estado' in n) return efectos.some((e) => 'estado' in e && e.estado === n.estado);
    if ('marca' in n) return efectos.some((e) => 'marca' in e && e.marca === n.marca);
    if ('lleva' in n) return efectos.some((e) => 'pieza' in e && e.pieza === n.lleva);
  }
  return false;
}

function condiciones(
  j: Juez,
  v: unknown,
  ruta: string,
  delLugar: DelLugar,
  apuntes: Apuntes,
): Condicion[] {
  if (v === undefined) return [];
  const out: Condicion[] = [];
  lista(j, v, ruta).forEach((c, i) => {
    const hecha = condicion(j, c, `${ruta}[${i}]`, delLugar, apuntes);
    if (hecha !== null) out.push(hecha);
  });
  return out;
}

function unaClave<K extends string>(
  j: Juez,
  v: unknown,
  ruta: string,
  claves: readonly K[],
  que: string,
): [K, unknown] | null {
  if (!esObjeto(v) || Object.keys(v).length !== 1) {
    j.mal(ruta, `${que} es un objeto de una sola clave; valen ${claves.join(', ')}`);
    return null;
  }
  const [k, x] = Object.entries(v)[0] as [string, unknown];
  const clave = claves.find((c) => c === k);
  if (clave === undefined) {
    j.mal(ruta, `«${k}» no es ${que}; valen ${claves.join(', ')}`);
    return null;
  }
  return [clave, x];
}

function condicion(
  j: Juez,
  v: unknown,
  ruta: string,
  delLugar: DelLugar,
  apuntes: Apuntes,
): Condicion | null {
  const par = unaClave(j, v, ruta, CLAVES_DE_CONDICION, 'una condición');
  if (par === null) return null;
  const [k, x] = par;
  switch (k) {
    case 'estado':
      if (typeof x !== 'string' || !delLugar.estados.has(x)) {
        j.mal(
          ruta,
          `el estado ${JSON.stringify(x)} no es de este lugar (${[...delLugar.estados].join(', ')})`,
        );
        return null;
      }
      return { estado: x };
    case 'marca':
      if (typeof x !== 'string' || !apuntes.marcas.has(x)) {
        j.mal(ruta, `la marca ${JSON.stringify(x)} no está declarada en «marcas»`);
        return null;
      }
      return { marca: x };
    case 'oro': {
      const n = entero(j, x, ruta, 1, 1_000_000);
      return n === null ? null : { oro: n };
    }
    case 'lleva':
      if (typeof x !== 'string' || piezaSiExiste(x) === null) {
        j.mal(ruta, `la pieza ${JSON.stringify(x)} no existe en el catálogo de equipo`);
        return null;
      }
      return { lleva: x };
    case 'faccion': {
      const f = faccion(j, x, ruta);
      return f === null ? null : { faccion: f };
    }
    case 'no': {
      if (esObjeto(x) && 'no' in x) {
        j.mal(ruta, 'un «no» de un «no» es la condición de dentro: escríbela sin los dos');
        return null;
      }
      const dentro = condicion(j, x, `${ruta}.no`, delLugar, apuntes);
      return dentro === null ? null : { no: dentro };
    }
  }
}

function efectos(
  j: Juez,
  v: unknown,
  ruta: string,
  delLugar: DelLugar,
  apuntes: Apuntes,
  permitidas: readonly ClaveDeEfecto[],
): Efecto[] {
  if (v === undefined) return [];
  const out: Efecto[] = [];
  const crudos = lista(j, v, ruta);
  crudos.forEach((e, i) => {
    const r = `${ruta}[${i}]`;
    const hecho = efecto(j, e, r, delLugar, apuntes, permitidas);
    if (hecho === null) return;
    if ('batalla' in hecho && i !== crudos.length - 1) {
      j.mal(
        r,
        'una batalla va la última de su lista: lo de después pasaría antes de saber quién gana',
      );
    }
    out.push(hecho);
  });
  return out;
}

function efecto(
  j: Juez,
  v: unknown,
  ruta: string,
  delLugar: DelLugar,
  apuntes: Apuntes,
  permitidas: readonly ClaveDeEfecto[],
): Efecto | null {
  const par = unaClave(j, v, ruta, CLAVES_DE_EFECTO, 'un efecto');
  if (par === null) return null;
  const [k, x] = par;
  if (!permitidas.includes(k)) {
    j.mal(ruta, `«${k}» no vale aquí; valen ${permitidas.join(', ')}`);
    return null;
  }
  switch (k) {
    case 'estado':
      if (typeof x !== 'string' || !delLugar.estados.has(x)) {
        j.mal(
          ruta,
          `el estado ${JSON.stringify(x)} no es de este lugar (${[...delLugar.estados].join(', ')})`,
        );
        return null;
      }
      return { estado: x };
    case 'marca':
      if (typeof x !== 'string' || !apuntes.marcas.has(x)) {
        j.mal(ruta, `la marca ${JSON.stringify(x)} no está declarada en «marcas»`);
        return null;
      }
      apuntes.marcasPuestas.add(x);
      return { marca: x };
    case 'oro': {
      // Al ganar no se cobra: tras la pelea no hay cómo fallar si no alcanza.
      const min = permitidas === EFECTOS_AL_GANAR ? 1 : -1_000_000;
      const n = entero(j, x, ruta, min, 1_000_000);
      if (n === 0) {
        j.mal(ruta, 'un oro de 0 no hace nada');
        return null;
      }
      return n === null ? null : { oro: n };
    }
    case 'pieza':
    case 'quitar':
      if (typeof x !== 'string' || piezaSiExiste(x) === null) {
        j.mal(ruta, `la pieza ${JSON.stringify(x)} no existe en el catálogo de equipo`);
        return null;
      }
      return k === 'pieza' ? { pieza: x } : { quitar: x };
    case 'tropa': {
      const t = objeto(j, x, `${ruta}.tropa`, ['unidad', 'n']);
      if (t === null) return null;
      const n = entero(j, t.n, `${ruta}.tropa.n`, 1, CUPO_HEROE);
      const malos = problemasDeGrupo([{ creature: String(t.unidad), count: n ?? 1 }], 'la tropa');
      if (malos.length > 0) {
        for (const m of malos) j.mal(`${ruta}.tropa`, m);
        return null;
      }
      return n === null ? null : { tropa: { unidad: String(t.unidad), n } };
    }
    case 'batalla':
      if (typeof x !== 'string' || !delLugar.encuentros.has(x)) {
        j.mal(
          ruta,
          `el encuentro ${JSON.stringify(x)} no es de este lugar (${[...delLugar.encuentros].join(', ') || 'no tiene'})`,
        );
        return null;
      }
      return { batalla: x };
  }
}

// ---------------------------------------------------------------- en la partida

/** Los objetos del mapa de los lugares de una historia ya validada. */
export function objetosDeLosLugares(historia: Historia): MapObject[] {
  return historia.lugares.map((l: Lugar) => ({
    kind: 'lugar',
    id: l.id,
    at: l.at,
    name: l.nombre,
  }));
}

/** El estado con que empieza una partida de ese mundo: cada lugar en su estado inicial, sin marcas. */
export function estadoInicialDelMundo(historia: Historia): EstadoDelMundo {
  return {
    historia,
    estados: Object.fromEntries(historia.lugares.map((l) => [l.id, l.estadoInicial])),
    marcas: [],
  };
}
