/**
 * La validación de un mundo: **la única**, para `pnpm mundo validar <id>`, el
 * servidor de desarrollo que lo genera y la página que lo carga. Lo que pasa sale
 * con la marca de leído (`MundoLeido`), y `newGame` lo juega sin juzgarlo otra vez.
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
 * de zod salen en inglés y el trozo de la página no lo necesita. Las piezas son
 * las del núcleo que devuelven el motivo (`core/validar.ts`), que aquí se acumula.
 */
import { problemasDeGrupo } from '../catalogo.js';
import { COMBATE_COMPLETO, cupoDelHeroe } from '../combate.js';
import { motivoDeLinea } from '../contract/linea.js';
import { problemaDeTipo } from '../hero/ascenso.js';
import { piezaSiExiste } from '../hero/equipo.js';
import { basesDelPlan, buildMap, type MapPlan, validateMapPlan } from '../map/generate.js';
import { type GameMap, inBounds, isEnterable, type MapObject, terrainAt } from '../map/map.js';
import { FUERA, pasosDelMapa, queEsElObjeto } from '../map/recinto.js';
import {
  type Banco,
  FIGURAS_NUEVAS_POR_MUNDO,
  figuraDelBanco,
  problemasDePeticiones,
} from '../npcs.js';
import { problemasDeGrupoNeutral, regionDeCasilla } from '../state/asaltantes.js';
import { personasDeLaFaccion } from '../town/voces.js';
import { FACTION_IDS, type FactionId, type Point } from '../types.js';
import {
  deLaListaBlocker,
  enteroBlocker,
  esObjeto,
  listaBlocker,
  problemasDeObjeto,
} from '../validar.js';
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
  type Historia,
  idDeMundoBlocker,
  type Lugar,
  type Mundo,
  type MundoLeido,
  trasLosEfectos,
  VERSION_DEL_MUNDO,
} from './formato.js';
import { recorrido } from './reglas.js';

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
 * Por qué no puede ir un lugar en `at`, o `null`: dentro del mapa y fuera de su
 * borde, en algo que se pisa, dentro de una región (ni nodo, ni barrera, ni el río), fuera de todo
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
  // En el borde, la escena del mapa recorta lo que va pegado al marco, y ninguna
  // ciudad ni pueblo va ahí (`recintoDeLaCiudad`, `colocarPar`).
  if (at.x === 0 || at.y === 0 || at.x === map.width - 1 || at.y === map.height - 1) {
    return `${donde} está en el borde del mapa: un lugar va a una casilla del borde o más`;
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

/** Un objeto con esos campos: dice lo que sobra y lo que falta. `null` si no es un objeto. */
function objeto(
  j: Juez,
  v: unknown,
  ruta: string,
  obligatorios: readonly string[],
  opcionales: readonly string[] = [],
): Record<string, unknown> | null {
  for (const m of problemasDeObjeto(v, [...obligatorios, ...opcionales], obligatorios)) {
    j.mal(ruta, m);
  }
  return esObjeto(v) ? v : null;
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
  const motivo = enteroBlocker(v, min, max);
  if (motivo !== null) {
    j.mal(ruta, motivo);
    return null;
  }
  return v as number;
}

function lista(j: Juez, v: unknown, ruta: string): readonly unknown[] {
  const motivo = listaBlocker(v);
  if (motivo !== null) {
    j.mal(ruta, motivo);
    return [];
  }
  return v as readonly unknown[];
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
  const motivo = deLaListaBlocker(v, FACTION_IDS);
  if (motivo !== null) {
    j.mal(ruta, `la facción ${motivo}`);
    return null;
  }
  return v as FactionId;
}

/** Un estado de este lugar, o `null` diciéndolo: lo nombran las condiciones y los efectos. */
function estadoDelLugar(j: Juez, x: unknown, ruta: string, delLugar: DelLugar): string | null {
  if (typeof x !== 'string' || !delLugar.estados.has(x)) {
    j.mal(
      ruta,
      `el estado ${JSON.stringify(x)} no es de este lugar (${[...delLugar.estados].join(', ')})`,
    );
    return null;
  }
  return x;
}

/** Una marca declarada en «marcas», o `null` diciéndolo. */
function marcaDeclarada(j: Juez, x: unknown, ruta: string, apuntes: Apuntes): string | null {
  if (typeof x !== 'string' || !apuntes.marcas.has(x)) {
    j.mal(ruta, `la marca ${JSON.stringify(x)} no está declarada en «marcas»`);
    return null;
  }
  return x;
}

/** Una pieza del catálogo de equipo, o `null` diciéndolo. */
function piezaDelCatalogo(j: Juez, x: unknown, ruta: string): string | null {
  if (typeof x !== 'string' || piezaSiExiste(x) === null) {
    j.mal(ruta, `la pieza ${JSON.stringify(x)} no existe en el catálogo de equipo`);
    return null;
  }
  return x;
}

// ---------------------------------------------------------------- el mundo

/** Los tres ficheros de un mundo, tal cual del disco. */
export interface CrudosDelMundo {
  readonly mundo: unknown;
  readonly plan: unknown;
  readonly historia: unknown;
}

/**
 * Todos los problemas de un mundo, con su fichero y su ruta, y el mundo leído si
 * no hay ninguno. `id` es el de su carpeta, que el `mundo.json` tiene que repetir.
 * El plan se juzga antes que el `mundo.json` porque el héroe se mira contra la
 * facción de la base del jugador 0, que es suya; los problemas salen en el orden
 * de los ficheros.
 */
function juzgarMundo(
  crudos: CrudosDelMundo,
  idEsperado: string,
  banco: Banco,
): { readonly problemas: readonly string[]; readonly leido: MundoLeido | null } {
  const delPlan: string[] = [];
  const plan = juzgarPlan(crudos.plan, delPlan);
  const delMundo: string[] = [];
  const mundo = juzgarMundoJson(crudos.mundo, idEsperado, plan?.faccion ?? null, delMundo);
  const malId = idDeMundoBlocker(idEsperado);
  const problemas = [
    ...(malId === null ? [] : [malId]),
    ...delMundo,
    ...delPlan,
    ...problemasDeLaHistoria(crudos.historia, plan?.map ?? null, banco, plan?.faccion ?? null),
  ];
  const leido =
    problemas.length === 0 && mundo !== null && plan !== null
      ? ({
          mundo,
          plan: plan.plan,
          historia: crudos.historia as Historia,
          faccion: plan.faccion,
        } as MundoLeido)
      : null;
  return { problemas, leido };
}

/**
 * Todos los problemas de un mundo, con su fichero y su ruta. Vacío: se juega.
 * `banco`: el banco de figuras de NPC, contra el que se miran las figuras que nombra
 * y las que pide (el núcleo no lee el fichero: lo pasa quien lo lee).
 */
export function problemasDelMundo(
  crudos: CrudosDelMundo,
  idEsperado: string,
  banco: Banco,
): string[] {
  return [...juzgarMundo(crudos, idEsperado, banco).problemas];
}

/**
 * El mundo leído, o lanza con todos sus problemas (la página lo pinta:
 * `arranque.ts`). **La única que da un `MundoLeido`.**
 */
export function leerMundo(crudos: CrudosDelMundo, idEsperado: string, banco: Banco): MundoLeido {
  const { problemas, leido } = juzgarMundo(crudos, idEsperado, banco);
  if (leido === null) {
    throw new Error(
      `el mundo "${idEsperado}" no se puede jugar (${problemas.length} problema${problemas.length === 1 ? '' : 's'}):\n- ${problemas.join('\n- ')}`,
    );
  }
  return leido;
}

function juzgarMundoJson(
  crudo: unknown,
  idEsperado: string,
  faccionDelPlan: FactionId | null,
  problemas: string[],
): Mundo | null {
  const j = new Juez('mundo.json');
  const o = objeto(j, crudo, '', ['version', 'id', 'semilla', 'jugador', 'rivales']);
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
    const jug = objeto(j, o.jugador, 'jugador', ['heroe']);
    if (jug !== null) {
      // Su facción es la de la base del jugador 0 del plan: con el plan roto, el
      // héroe no tiene contra qué mirarse (el plan ya dice su problema).
      if (typeof jug.heroe !== 'string') j.mal('jugador.heroe', 'tiene que ser un texto');
      else if (faccionDelPlan !== null) {
        const malo = problemaDeTipo(faccionDelPlan, jug.heroe);
        if (malo !== null) j.mal('jugador.heroe', malo);
      }
    }
    if (o.rivales !== 1) {
      j.mal(
        'rivales',
        `es ${JSON.stringify(o.rivales)}: este juego aún juega contra un solo rival (el generador no sabe de más bandos)`,
      );
    }
  }
  problemas.push(...j.problemas);
  return j.problemas.length === 0 ? (crudo as Mundo) : null;
}

/** El plan válido, su mapa y la facción de quien juega (la de la base del jugador 0), o `null`. */
function juzgarPlan(
  crudo: unknown,
  problemas: string[],
): { readonly plan: MapPlan; readonly map: GameMap; readonly faccion: FactionId } | null {
  if (!esObjeto(crudo)) {
    problemas.push('plan.json: tiene que ser el objeto de un plan de mapa');
    return null;
  }
  for (const k of ['regions', 'walls', 'nodes', 'towns', 'villages', 'monsters', 'chests']) {
    if (!Array.isArray(crudo[k])) {
      problemas.push(`plan.json: «${k}» tiene que ser una lista: no es el plan de un mapa`);
      return null;
    }
  }
  const plan = crudo as unknown as MapPlan;
  try {
    const delPlan = validateMapPlan(plan);
    if (delPlan.length > 0) {
      problemas.push(...delPlan.map((p) => `plan.json: ${p}`));
      return null;
    }
    const bases = basesDelPlan(plan);
    const base0 = bases.get(0);
    if (bases.size !== 2 || base0 === undefined || !bases.has(1)) {
      problemas.push(
        `plan.json: tiene las bases de ${[...bases.keys()].join(', ') || 'nadie'} y un mundo de hoy es de los jugadores 0 y 1`,
      );
      return null;
    }
    return { plan, map: buildMap(plan).map, faccion: base0.faction };
  } catch (err) {
    problemas.push(`plan.json: no se puede construir: ${err instanceof Error ? err.message : err}`);
    return null;
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
  /** Las figuras que se pueden nombrar: las del banco y las que pide la historia. */
  readonly figuraBlocker: (id: unknown) => string | null;
  /** Las figuras pedidas que alguien nombra: una pedida sin usar se pintaría para nada. */
  readonly figurasUsadas: Set<string>;
}

/**
 * Los problemas de un `historia.json`. Con `map` (el del plan), también lo que
 * depende del mapa (la casilla de cada lugar); sin él (el plan no se pudo
 * construir), solo lo suyo.
 */
function problemasDeLaHistoria(
  crudo: unknown,
  map: GameMap | null,
  banco: Banco,
  faccionDeQuienJuega: FactionId | null,
): string[] {
  const j = new Juez('historia.json');
  const o = objeto(j, crudo, '', ['titulo', 'resumen', 'marcas', 'lugares'], ['figuras', 'base']);
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
  const pedidas = juzgarFigurasPedidas(j, o.figuras, banco);
  const apuntes: Apuntes = {
    marcas,
    marcasPuestas: new Set(),
    figuraBlocker: (id) =>
      typeof id === 'string' && (figuraDelBanco(banco, id) !== undefined || pedidas.has(id))
        ? null
        : `${JSON.stringify(id)} no es una figura del banco de NPC (\`npcs.figuras\` de la lectura) ni una de las que pides en «figuras»`,
    figurasUsadas: new Set(),
  };
  juzgarLaBase(j, o.base, apuntes, faccionDeQuienJuega);

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
    if (map === null || hecho.at === null) return;
    const choca = map.objects.find((x) => x.id === hecho.id);
    if (choca !== undefined) {
      j.mal(`lugares[${i}].id`, `"${hecho.id}" ya es el id ${deLo(queEsElObjeto(choca))} del mapa`);
    }
    const motivo = lugarBlocker(map, hecho.at, colocados);
    if (motivo !== null) j.mal(`lugares[${i}].at`, motivo);
    colocados.push({ at: hecho.at, name: hecho.nombre });
  });

  for (const id of pedidas) {
    if (!apuntes.figurasUsadas.has(id)) {
      j.mal(
        `figuras.${id}`,
        'no la nombra ninguna persona ni la gente de la base: una figura pedida se pinta para alguien',
      );
    }
  }
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

/**
 * Las figuras nuevas que pide la historia (`figuras`), con la regla de unas
 * peticiones del banco (`problemasDePeticiones`: cada una, un id libre y como mucho
 * `FIGURAS_NUEVAS_POR_MUNDO`), la misma con que las acepta el banco al pasar el
 * mundo (`tools/npcs/banco.ts`). Devuelve los ids pedidos.
 */
function juzgarFigurasPedidas(j: Juez, v: unknown, banco: Banco): ReadonlySet<string> {
  if (v === undefined) return new Set();
  for (const m of problemasDePeticiones(v, banco, 'figuras', FIGURAS_NUEVAS_POR_MUNDO))
    j.mal('', m);
  return new Set(esObjeto(v) ? Object.keys(v) : []);
}

/**
 * La figura de la gente de la base de quien juega (`base`): cada clave, una persona
 * de su facción (`personasDeLaFaccion`), y cada valor, una figura que existe.
 */
function juzgarLaBase(j: Juez, v: unknown, apuntes: Apuntes, faccion: FactionId | null): void {
  if (v === undefined) return;
  if (!esObjeto(v)) {
    j.mal('base', 'tiene que ser un objeto {"<persona>": "<figura>"}');
    return;
  }
  // Sin el plan no se sabe de qué facción es la base: el plan ya dice su problema.
  const personas = faccion === null ? null : personasDeLaFaccion(faccion).map((p) => p.id);
  for (const [k, id] of Object.entries(v)) {
    if (personas !== null && !personas.includes(k)) {
      j.mal(
        `base.${k}`,
        `"${k}" no es de la gente de la base de quien juega (${faccion}): ${personas.join(', ')}`,
      );
    }
    const malo = apuntes.figuraBlocker(id);
    if (malo !== null) j.mal(`base.${k}`, malo);
    else apuntes.figurasUsadas.add(id as string);
  }
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
    const g = efectos(j, enc.alGanar, `${r}.alGanar`, delLugar, apuntes, EFECTOS_AL_GANAR, true);
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
      const per = objeto(j, op.persona, `${r}.persona`, ['nombre', 'papel', 'figura']);
      if (per !== null) {
        texto(j, per.nombre, `${r}.persona.nombre`, LARGO.nombre);
        texto(j, per.papel, `${r}.persona.papel`, LARGO.nombre);
        const malo = apuntes.figuraBlocker(per.figura);
        if (malo !== null) j.mal(`${r}.persona.figura`, malo);
        else apuntes.figurasUsadas.add(per.figura as string);
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
  // Las salidas de cada nodo, también las de las opciones que hacen algo: tras
  // elegir una, la conversación sigue en su nodo y desde él se alcanza lo de
  // después (`nodosAlcanzables`, con `EstadoDelMundo.conversaciones`).
  const lleva = new Map<string, string[]>();
  const juzgadas = new Map<string, OpcionJuzgada[]>();
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
    const deEste: OpcionJuzgada[] = [];
    opciones.forEach((op, i) => {
      const ro = `${r}.opciones[${i}]`;
      const oo = objeto(j, op, ro, ['texto'], ['si', 'hace', 'ir']);
      if (oo === null) return;
      texto(j, oo.texto, `${ro}.texto`, LARGO.opcion);
      const si = condiciones(j, oo.si, `${ro}.si`, ctx.delLugar, ctx.apuntes);
      const hace = efectos(j, oo.hace, `${ro}.hace`, ctx.delLugar, ctx.apuntes, CLAVES_DE_EFECTO);
      let ir: string | null = null;
      if ('ir' in oo) {
        if (typeof oo.ir !== 'string' || !nodos.has(oo.ir)) {
          j.mal(`${ro}.ir`, `${JSON.stringify(oo.ir)} no es uno de los nodos de este diálogo`);
        } else {
          destinos.push(oo.ir);
          ir = oo.ir;
        }
      }
      deEste.push({ ruta: ro, texto: String(oo.texto), si, hace, ir });
      for (const e of hace) if ('batalla' in e) ctx.encuentrosUsados.add(e.batalla);
      const motivo = noSeApaga([...ctx.siDelPunto, ...si], hace, ctx.alGanar);
      if (motivo !== null) j.mal(ro, motivo);
    });
    lleva.set(k, destinos);
    juzgadas.set(k, deEste);
  }
  // Todo nodo se alcanza desde el inicio: uno suelto es texto que nadie lee.
  if (typeof d.inicio === 'string' && nodos.has(d.inicio)) {
    const inicio = d.inicio;
    const leidos = recorrido([inicio], (n) => lleva.get(n) ?? []);
    for (const k of nodos.keys()) {
      if (!leidos.includes(k)) {
        j.mal(`${ruta}.nodos.${k}`, `no se llega a él desde el inicio («${inicio}»)`);
      }
    }
    noCortaSuCamino(j, inicio, juzgadas, ctx.siDelPunto);
  }
}

/** Una opción ya juzgada, con lo que de ella lee `noCortaSuCamino`. */
interface OpcionJuzgada {
  readonly ruta: string;
  readonly texto: string;
  readonly si: readonly Condicion[];
  readonly hace: readonly Efecto[];
  /** El nodo al que lleva, si es uno del diálogo. */
  readonly ir: string | null;
}

/**
 * Que ninguna opción con «hace» e «ir» corte su propio camino (H14 de la vuelta 2
 * de QA de la F1a): tras ella, la conversación sigue en su «ir» —también al volver,
 * que se abre donde quedó (`nodoDeEntrada`)—, así que lo que hay allí tiene que
 * poderse elegir. Se simula lo determinista de elegirla, el estado y las marcas
 * (`trasLosEfectos`; lo que da y cobra depende de la partida), y se rechaza:
 *
 * - si deja de cumplirse el «si» de su punto y tras ella hay opciones con «hace»:
 *   el punto sale de la escena y ellas ya no se eligen (el pago que pasa el puente a
 *   «pagado» con Corvo en `si: guardado` y lleva a abrir el arcón);
 * - si una opción con «hace» a la que solo se llega por ella pide lo que ella deja de
 *   cumplir (el arcón con `si: guardado`). Una a la que también se llega desde el
 *   inicio no: dejar de poder elegirla tras otra es una elección (pagar o pelear).
 *
 * Una opción que lleva a un nodo de despedida (sin opciones con «hace») puede sacar
 * a su punto de la escena: no se pierde nada (Corvo, «Pase, pase»).
 */
function noCortaSuCamino(
  j: Juez,
  inicio: string,
  juzgadas: ReadonlyMap<string, readonly OpcionJuzgada[]>,
  siDelPunto: readonly Condicion[],
): void {
  const navegando =
    (corta: (c: Condicion) => boolean) =>
    (n: string): readonly string[] =>
      (juzgadas.get(n) ?? []).flatMap((o) =>
        o.hace.length === 0 && o.ir !== null && !o.si.some(corta) ? [o.ir] : [],
      );
  const desdeElInicio = recorrido(
    [inicio],
    navegando(() => false),
  );
  for (const o of [...juzgadas.values()].flat()) {
    if (o.hace.length === 0 || o.ir === null) continue;
    const tras = trasLosEfectos(undefined, [], o.hace);
    const corta = (c: Condicion) => seIncumpleTras(c, tras);
    const detras = recorrido([o.ir], navegando(corta));
    const conHace = (nodos: readonly string[]) =>
      nodos.flatMap((n) => juzgadas.get(n) ?? []).filter((x) => x !== o && x.hace.length > 0);
    const despues = conHace(detras);
    const delPunto = siDelPunto.find(corta);
    if (delPunto !== undefined && despues.length > 0) {
      j.mal(
        o.ruta,
        `lleva a «${o.ir}», pero sus efectos sacan de la escena a su punto (deja de cumplirse ${JSON.stringify(delPunto)}, de su «si») y lo que hay tras ella ya no se elegiría nunca («${(despues[0] as OpcionJuzgada).texto}»): quítale el «ir», llévala a un nodo de despedida sin opciones con «hace» o no cambies lo que pide el punto`,
      );
      continue;
    }
    for (const x of conHace(detras.filter((n) => !desdeElInicio.includes(n)))) {
      const c = x.si.find(corta);
      if (c === undefined) continue;
      j.mal(
        x.ruta,
        `pide ${JSON.stringify(c)}, y solo se llega a ella tras «${o.texto}», que lo deja de cumplir: no se elegiría nunca`,
      );
    }
  }
}

/** Si `c` deja de cumplirse tras el estado y las marcas `tras` (`trasLosEfectos`): solo lo que se sabe. */
function seIncumpleTras(
  c: Condicion,
  tras: { readonly estado: string | undefined; readonly marcas: readonly string[] },
): boolean {
  if ('estado' in c) return tras.estado !== undefined && tras.estado !== c.estado;
  if ('no' in c) {
    const n = c.no;
    if ('estado' in n) return tras.estado === n.estado;
    if ('marca' in n) return tras.marcas.includes(n.marca);
  }
  return false;
}

/**
 * La regla de la opción que se apaga (P-c del usuario): si da algo —oro, una
 * pieza, tropa— o abre una batalla, lo que aplica (sus efectos y, si pelea, los de
 * ganar) tiene que dejar de cumplir alguna de sus condiciones (las suyas o las de su
 * punto). `null`: se apaga, o no da nada. **Es un aviso temprano y no la regla**:
 * que cada premio se cobre una vez lo hace cumplir el núcleo (`EstadoDelMundo.cobradas`
 * y `vencidos`), también cuando otra opción vuelve a encenderla. Esto pide que la
 * historia lo diga con su propia condición, que es la que pone la frase del motor
 * («ya te llevaste la lanza») debajo de la opción apagada.
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
    case 'estado': {
      const estado = estadoDelLugar(j, x, ruta, delLugar);
      return estado === null ? null : { estado };
    }
    case 'marca': {
      const marca = marcaDeclarada(j, x, ruta, apuntes);
      return marca === null ? null : { marca };
    }
    case 'oro': {
      const n = entero(j, x, ruta, 1, 1_000_000);
      return n === null ? null : { oro: n };
    }
    case 'lleva': {
      const lleva = piezaDelCatalogo(j, x, ruta);
      return lleva === null ? null : { lleva };
    }
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

/**
 * Una lista de efectos de las claves `permitidas`. `alGanar`: es la de ganar un
 * encuentro, donde no se cobra oro (tras la pelea no hay cómo fallar si no alcanza).
 */
function efectos(
  j: Juez,
  v: unknown,
  ruta: string,
  delLugar: DelLugar,
  apuntes: Apuntes,
  permitidas: readonly ClaveDeEfecto[],
  alGanar = false,
): Efecto[] {
  if (v === undefined) return [];
  const out: Efecto[] = [];
  const crudos = lista(j, v, ruta);
  crudos.forEach((e, i) => {
    const r = `${ruta}[${i}]`;
    const hecho = efecto(j, e, r, delLugar, apuntes, permitidas, alGanar);
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
  alGanar: boolean,
): Efecto | null {
  const par = unaClave(j, v, ruta, CLAVES_DE_EFECTO, 'un efecto');
  if (par === null) return null;
  const [k, x] = par;
  if (!permitidas.includes(k)) {
    j.mal(ruta, `«${k}» no vale aquí; valen ${permitidas.join(', ')}`);
    return null;
  }
  switch (k) {
    case 'estado': {
      const estado = estadoDelLugar(j, x, ruta, delLugar);
      return estado === null ? null : { estado };
    }
    case 'marca': {
      const marca = marcaDeclarada(j, x, ruta, apuntes);
      if (marca === null) return null;
      apuntes.marcasPuestas.add(marca);
      return { marca };
    }
    case 'oro': {
      const min = alGanar ? 1 : -1_000_000;
      const n = entero(j, x, ruta, min, 1_000_000);
      if (n === 0) {
        j.mal(ruta, 'un oro de 0 no hace nada');
        return null;
      }
      return n === null ? null : { oro: n };
    }
    case 'pieza':
    case 'quitar': {
      const pieza = piezaDelCatalogo(j, x, ruta);
      if (pieza === null) return null;
      return k === 'pieza' ? { pieza } : { quitar: pieza };
    }
    case 'tropa': {
      const t = objeto(j, x, `${ruta}.tropa`, ['unidad', 'n']);
      if (t === null) return null;
      // Lo más que cabe con un héroe con el tope más alto: la complejidad la elige
      // quien juega, y en la partida lo que no cabe lo rechaza `troopBlocker`.
      const n = entero(j, t.n, `${ruta}.tropa.n`, 1, cupoDelHeroe(COMBATE_COMPLETO.tope));
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

/** El estado con que empieza una partida de ese mundo: cada lugar en su estado inicial, sin marcas ni nada cobrado. */
export function estadoInicialDelMundo(historia: Historia): EstadoDelMundo {
  return {
    historia,
    estados: Object.fromEntries(historia.lugares.map((l) => [l.id, l.estadoInicial])),
    marcas: [],
    cobradas: {},
    vencidos: {},
    conversaciones: {},
  };
}
