/**
 * El banco de figuras de NPC: la gente que no pelea —la de la base y la de los
 * lugares de un mundo— y su figura (22-10-2026, `docs/agents/2026-10-22-banco-de-npcs/`,
 * la rebanada de personajes de la F2 del mapa vivo).
 *
 * El banco son metadatos (`data/npcs.json`: id, descripción en prosa, etiquetas de
 * un vocabulario cerrado, talla y qué acciones lleva) y arte (`assets/npcs/<id>/`).
 * Pensado para que el motor de narrativa elija por etiquetas y descripción, y para
 * pasar un día a un servidor con esos mismos metadatos.
 *
 * **El núcleo no lee el fichero**: es puro, y el banco crece mientras se juega (el
 * taller escribe hojas y el motor pide figuras), así que le llega como parámetro. Lo
 * leen y lo escriben las herramientas (`tools/npcs/banco.ts`, el único que toca
 * `data/npcs.json`) y lo sirve `pnpm dev` (`/__npcs`); aquí está su forma, su
 * vocabulario y su validación, la misma para todos.
 *
 * **Si una figura está pintada no se escribe**: se deriva de si sus ocho
 * `dN/atlas.json` están en disco (`pintadas`, que pasa quien lee el disco). Una
 * pedida y sin pintar es un estado legal, no una figura rota.
 */
import { motivoDeLinea } from './contract/linea.js';
import { hashDeTexto } from './rng.js';
import type { FactionId } from './types.js';
import { esIdDeUnidad, esObjeto, problemasDeObjeto } from './validar.js';

/**
 * Las etiquetas de una figura, cada una con su lista cerrada y la frase de cada
 * palabra para el motor. **Exhaustivo por tipo**, como `VOCABULARIO`: una palabra
 * nueva sin frase no compila, y la lectura para el motor sale de aquí.
 */
export const ETIQUETAS = {
  oficio: {
    autoridad: 'quien manda: alcaide, regidor, jefe del campamento, castellano',
    escribano:
      'quien lleva las cuentas o las cartas: escribano, contador, burgomaestre de despacho',
    soldado: 'guardia, vigía, sargento o veterano: lleva ropa de servicio',
    sacerdote: 'clérigo, monje, prior, sacerdotisa, plañidera',
    mago: 'maestro de un gremio de magia, chamán, nigromante',
    tabernero: 'tabernero, posadero, quien sirve',
    mercader: 'mercader, prestamista, trapero, trueque',
    artesano: 'herrero, armero, fundidor, maestro de obras, carpintero',
    campesino: 'campesino, lavandera, mozo, pastor: el trabajo del campo y de la casa',
    sirviente: 'criado, mozo de cuadra, acólito, recogedor',
    erudito: 'sabio, bibliotecario, maestro',
    noble: 'señor, dama, caballero sin armadura de batalla',
    cazador: 'cazador, montero, guardabosques, guía',
    vagabundo: 'peregrino, mendigo, desertor, trotamundos',
  },
  sexo: {
    hombre: 'un hombre',
    mujer: 'una mujer',
    indistinto: 'no se distingue o no importa (un espectro, un esqueleto)',
  },
  edad: {
    joven: 'joven',
    adulto: 'adulto',
    anciano: 'anciano',
  },
  especie: {
    humano: 'humano',
    elfo: 'elfo: alto, orejas largas',
    orko: 'orko: grande, piel verde',
    goblin: 'goblin: pequeño (talla 0,7)',
    troll: 'troll: enorme (talla 1,3 o más)',
    esqueleto: 'esqueleto: hueso pelado',
    zombi: 'zombi: carne muerta',
    espectro: 'espectro: forma espectral, flotante',
  },
  faccion: {
    templarios: 'templarios: villa cristiana medieval, sobrevestas blancas y cruces rojas',
    'no-muertos': 'no muertos: necrópolis, ropas negras y moradas, hueso y carne muerta',
    imperio: 'imperio: ciudad renacentista, jubones acuchillados, colores fuertes',
    elfos: 'elfos: claro del bosque, verdes y pardos, madera y hojas',
    orkos: 'orkos: campamento, pieles, hierro tosco y pinturas de guerra',
  },
  clase: {
    baja: 'baja: ropa gastada y remendada',
    media: 'media: ropa buena de oficio',
    alta: 'alta: ropa rica, joyas, insignias',
  },
} as const satisfies Record<string, Record<string, string>> & {
  readonly faccion: Readonly<Record<FactionId, string>>;
};

export type ClaveDeEtiqueta = keyof typeof ETIQUETAS;
export const CLAVES_DE_ETIQUETA = Object.keys(ETIQUETAS) as readonly ClaveDeEtiqueta[];
export type Oficio = keyof typeof ETIQUETAS.oficio;
export type Sexo = keyof typeof ETIQUETAS.sexo;
export type Edad = keyof typeof ETIQUETAS.edad;
export type Especie = keyof typeof ETIQUETAS.especie;
export type Clase = keyof typeof ETIQUETAS.clase;

/** Las etiquetas de una figura: una palabra de cada lista de `ETIQUETAS`. */
export interface EtiquetasDeNpc {
  readonly oficio: Oficio;
  readonly sexo: Sexo;
  readonly edad: Edad;
  readonly especie: Especie;
  readonly faccion: FactionId;
  readonly clase: Clase;
}

// Que `faccion` sean justo las facciones del juego: una nueva sin frase no compila.
const _faccionesConFrase: Readonly<Record<FactionId, string>> = ETIQUETAS.faccion;
void _faccionesConFrase;

/**
 * Qué acciones lleva una figura, con su frase para el motor. La gente de hoy solo
 * está de pie y anda (la hoja A: reposo, marcha y carga); la hoja B (ataque, daño y
 * muerte) son ocho imágenes más que **hoy ninguna escena pinta** (decisión del
 * usuario: «lo decide el motor de narrativa cuando la pide»).
 */
export const ACCIONES_DE_NPC = {
  'reposo-y-marcha':
    'de pie y andando (la hoja A: reposo, marcha y carrera): lo de toda la gente de hoy, unas 10 imágenes',
  todas:
    'además ataque, daño y muerte (la hoja B): 8 imágenes más que hoy ninguna escena pinta; pídela solo si la historia lo necesita de verdad',
} as const;
export type AccionesDeNpc = keyof typeof ACCIONES_DE_NPC;

/** Lo largo de la descripción de una figura: un párrafo que dice cómo es de cuerpo entero. */
export const LARGO_DE_DESCRIPCION = 400;
/** La talla, frente a la de un adulto: un goblin 0,7, un troll 1,3. */
export const TALLA = { minima: 0.5, maxima: 2.5 } as const;
/**
 * Cuántas figuras nuevas puede pedir un mundo: cuatro con la hoja A son ~40
 * imágenes de Codex. Un mundo de ocho lugares con su base gastaría 100-150 sin
 * tope (la crítica), y el motor tiene que reutilizar antes de pedir.
 */
export const FIGURAS_NUEVAS_POR_MUNDO = 4;
/** Lo largo del id de una figura. */
const LARGO_DEL_ID = 48;

/** Lo que pide quien quiere una figura nueva: el motor en su historia o la semilla. */
export interface PeticionDeFigura {
  /** Cómo es de cuerpo entero, para el pintor y para el motor que la busque. */
  readonly descripcion: string;
  readonly etiquetas: EtiquetasDeNpc;
  /** Su altura frente a la de un adulto (`TALLA`). */
  readonly talla: number;
  readonly acciones: AccionesDeNpc;
}

/** Una figura del banco: la petición con su id y quién la pidió. */
export interface FiguraDeNpc extends PeticionDeFigura {
  readonly id: string;
  /** El mundo que la pidió, o `semilla`: metadato para el servidor de mañana. */
  readonly pedidaPor: string;
}

/** El banco leído y juzgado (`leerBanco`). */
export interface Banco {
  readonly figuras: readonly FiguraDeNpc[];
}

/** El banco vacío: el de una página sin `/__npcs`, que pinta a toda la gente con el Y Bot. */
export const BANCO_VACIO: Banco = { figuras: [] };

/**
 * El banco con lo que de él está pintado (sus ocho direcciones en disco): lo que
 * necesita quien elige figuras. Lo que está pintado lo dice quien lee el disco
 * (`/__npcs`, `tools/npcs/banco.ts`), nunca el banco.
 */
export interface BancoPintado {
  readonly banco: Banco;
  readonly pintadas: ReadonlySet<string>;
}

/** Sin banco: toda la gente con el Y Bot (los tests y una página sin `/__npcs`). */
export const SIN_BANCO: BancoPintado = { banco: BANCO_VACIO, pintadas: new Set() };

/** Si `id` tiene la forma del id de una figura: la de una carpeta de `assets/` (`esIdDeUnidad`). */
export function esIdDeNpc(id: string): boolean {
  return id.length <= LARGO_DEL_ID && esIdDeUnidad(id);
}

const CAMPOS_DE_PETICION = ['descripcion', 'etiquetas', 'talla', 'acciones'] as const;
const CAMPOS_DE_FIGURA = ['id', ...CAMPOS_DE_PETICION, 'pedidaPor'] as const;

/** Lo que no vale de una lista cerrada, para la persona: «"x" no es un oficio: hay …». */
function deLaLista(
  lista: Readonly<Record<string, string>>,
  v: unknown,
  que: string,
): string | null {
  return typeof v === 'string' && Object.hasOwn(lista, v)
    ? null
    : `${JSON.stringify(v)} no es ${que}: ${Object.keys(lista).join(', ')}`;
}

/** Cómo se dice cada clave de etiqueta en un problema. */
const QUE_ES: Readonly<Record<ClaveDeEtiqueta, string>> = {
  oficio: 'un oficio',
  sexo: 'un sexo',
  edad: 'una edad',
  especie: 'una especie',
  faccion: 'una facción',
  clase: 'una clase',
};

/** Lo que no vale de unas etiquetas, cada problema con su ruta. */
export function problemasDeEtiquetas(v: unknown, ruta: string): string[] {
  const problemas = problemasDeObjeto(v, CLAVES_DE_ETIQUETA, CLAVES_DE_ETIQUETA).map(
    (m) => `${ruta}: ${m}`,
  );
  if (!esObjeto(v)) return problemas;
  for (const k of CLAVES_DE_ETIQUETA) {
    if (!(k in v)) continue;
    const m = deLaLista(ETIQUETAS[k], v[k], QUE_ES[k]);
    if (m !== null) problemas.push(`${ruta}.${k}: ${m}`);
  }
  return problemas;
}

/**
 * Lo que no vale de una petición de figura, cada problema con su ruta y escrito
 * para quien la escribe: la semilla a mano o el motor en su `historia.json`
 * (`figuras.<id>`). Vacío, vale.
 */
export function problemasDePeticion(v: unknown, ruta: string): string[] {
  const problemas = problemasDeObjeto(v, CAMPOS_DE_PETICION, CAMPOS_DE_PETICION).map(
    (m) => `${ruta}: ${m}`,
  );
  if (!esObjeto(v)) return problemas;
  return [...problemas, ...problemasDeLoComun(v, ruta)];
}

/** La descripción, las etiquetas, la talla y las acciones: lo de una petición y de una figura. */
function problemasDeLoComun(v: Record<string, unknown>, ruta: string): string[] {
  const problemas: string[] = [];
  if ('descripcion' in v) {
    const m =
      typeof v.descripcion === 'string'
        ? motivoDeLinea(v.descripcion, LARGO_DE_DESCRIPCION, 'la descripción')
        : 'la descripción tiene que ser un texto';
    if (m !== null) problemas.push(`${ruta}.descripcion: ${m}`);
    else if ((v.descripcion as string).length < 40)
      problemas.push(
        `${ruta}.descripcion: es muy corta: di cómo es de cuerpo entero (ropa, colores, lo que lleva), que es lo que se pinta`,
      );
  }
  if ('etiquetas' in v) problemas.push(...problemasDeEtiquetas(v.etiquetas, `${ruta}.etiquetas`));
  if (
    'talla' in v &&
    !(typeof v.talla === 'number' && v.talla >= TALLA.minima && v.talla <= TALLA.maxima)
  ) {
    problemas.push(
      `${ruta}.talla: tiene que ser un número de ${TALLA.minima} a ${TALLA.maxima} (la de un adulto es 1), y es ${JSON.stringify(v.talla)}`,
    );
  }
  if ('acciones' in v) {
    const m = deLaLista(ACCIONES_DE_NPC, v.acciones, 'unas acciones');
    if (m !== null) problemas.push(`${ruta}.acciones: ${m}`);
  }
  return problemas;
}

/** Lo que no vale de una figura del banco, cada problema con su ruta. Vacío, vale. */
export function problemasDeFigura(v: unknown, ruta: string): string[] {
  const problemas = problemasDeObjeto(v, CAMPOS_DE_FIGURA, CAMPOS_DE_FIGURA).map(
    (m) => `${ruta}: ${m}`,
  );
  if (!esObjeto(v)) return problemas;
  if ('id' in v && (typeof v.id !== 'string' || !esIdDeNpc(v.id))) {
    problemas.push(
      `${ruta}.id: ${JSON.stringify(v.id)} no es el id de una figura: minúsculas, cifras y «-», de 1 a ${LARGO_DEL_ID}`,
    );
  }
  if ('pedidaPor' in v && (typeof v.pedidaPor !== 'string' || !esIdDeNpc(v.pedidaPor))) {
    problemas.push(
      `${ruta}.pedidaPor: ${JSON.stringify(v.pedidaPor)} no es el id de un mundo ni «semilla»`,
    );
  }
  return [...problemas, ...problemasDeLoComun(v, ruta)];
}

/**
 * Todo lo que no vale del banco crudo (`{ _comment, figuras: [...] }`), con su ruta:
 * cada figura y los ids repetidos. Vacío, vale.
 */
export function problemasDelBanco(crudo: unknown): string[] {
  if (!esObjeto(crudo) || !Array.isArray(crudo.figuras)) {
    return ['data/npcs.json: tiene que ser {"_comment": "…", "figuras": [ … ]}'];
  }
  const sobran = Object.keys(crudo).filter((k) => k !== '_comment' && k !== 'figuras');
  const problemas = sobran.map((k) => `data/npcs.json: «${k}» sobra: lleva _comment y figuras`);
  const vistos = new Map<string, number>();
  crudo.figuras.forEach((f: unknown, i) => {
    problemas.push(...problemasDeFigura(f, `data/npcs.json: figuras[${i}]`));
    const id = esObjeto(f) && typeof f.id === 'string' ? f.id : null;
    if (id === null) return;
    const antes = vistos.get(id);
    if (antes !== undefined)
      problemas.push(`data/npcs.json: figuras[${i}].id: "${id}" ya es la figura ${antes}`);
    else vistos.set(id, i);
  });
  return problemas;
}

/**
 * El banco leído, o lanza con todos sus problemas: lo leen las herramientas al
 * abrir el fichero y la página al recibir `/__npcs` (un banco roto lo pinta
 * `arranque.ts`, como un catálogo roto).
 */
export function leerBanco(crudo: unknown): Banco {
  const problemas = problemasDelBanco(crudo);
  if (problemas.length > 0) {
    throw new Error(
      `el banco de figuras de NPC no vale (${problemas.length} problema${problemas.length === 1 ? '' : 's'}):\n- ${problemas.join('\n- ')}`,
    );
  }
  const { figuras } = crudo as { figuras: FiguraDeNpc[] };
  return { figuras: figuras.map((f) => ({ ...f, etiquetas: { ...f.etiquetas } })) };
}

/** La figura `id` del banco, o `undefined`. */
export function figuraDelBanco(banco: Banco, id: string): FiguraDeNpc | undefined {
  return banco.figuras.find((f) => f.id === id);
}

/** Las etiquetas por las que se busca una figura parecida: las de una persona o una figura. */
export interface Buscada {
  readonly faccion: FactionId;
  readonly especie: Especie;
  readonly sexo: Sexo;
  readonly oficio: Oficio;
}

/**
 * Las figuras pintadas que le valen a `buscada`, de la que más se le parece a la que
 * menos: **de su facción** (solo esas le valen), y por misma especie, mismo sexo,
 * las que no estén en `usadas` (para no repetir en una base mientras haya), mismo
 * oficio y, para desempatar, un hash de `clave` y el id de la figura (sin azar de la
 * partida: misma clave, mismo orden).
 */
export function figurasParecidas(
  banco: Banco,
  pintadas: ReadonlySet<string>,
  buscada: Buscada,
  clave: string,
  usadas: ReadonlySet<string> = new Set(),
): readonly FiguraDeNpc[] {
  const nota = (f: FiguraDeNpc): number[] => [
    f.etiquetas.especie === buscada.especie ? 0 : 1,
    f.etiquetas.sexo === buscada.sexo ? 0 : 1,
    usadas.has(f.id) ? 1 : 0,
    f.etiquetas.oficio === buscada.oficio ? 0 : 1,
    hashDeTexto(`${clave}|${f.id}`),
  ];
  return banco.figuras
    .filter((f) => pintadas.has(f.id) && f.etiquetas.faccion === buscada.faccion)
    .map((f) => ({ f, n: nota(f) }))
    .sort((a, b) => {
      for (let i = 0; i < a.n.length; i++) {
        const d = (a.n[i] as number) - (b.n[i] as number);
        if (d !== 0) return d;
      }
      return 0;
    })
    .map(({ f }) => f);
}

/**
 * La figura con que se pinta quien nombra la figura `id`: ella si está pintada; si
 * no (pedida y aún en el taller), la más parecida de las pintadas
 * (`figurasParecidas`, por sus etiquetas); `null` si no hay ninguna de su facción, y
 * entonces va el Y Bot. `peticiones`: las que un mundo pidió y aún no están en el
 * banco (su historia sin aceptar). Lanza si `id` no está en ninguno: la validación
 * del mundo ya lo habría dicho.
 */
export function figuraQueSePinta(
  banco: Banco,
  pintadas: ReadonlySet<string>,
  id: string,
  clave: string,
  peticiones: Readonly<Record<string, PeticionDeFigura>> = {},
): string | null {
  if (pintadas.has(id)) return id;
  const etiquetas = (figuraDelBanco(banco, id) ?? peticiones[id])?.etiquetas;
  if (etiquetas === undefined) {
    throw new Error(`la figura "${id}" no está en el banco de NPC ni la pide el mundo`);
  }
  return figurasParecidas(banco, pintadas, etiquetas, `${clave}|${id}`)[0]?.id ?? null;
}
