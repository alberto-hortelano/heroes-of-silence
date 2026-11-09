/**
 * Lo que no vale de un hechizo y del catálogo de hechizos, **todo a la vez**: la
 * página del editor enseña la lista entera y la carga del juego lanza con ella.
 * Cada frase dice dónde («efectos[0] (disparador): …»). Lo que no se juzga: si el
 * hechizo tiene sentido (un Berserker que hiere al aliado vale) ni su coste.
 */

import { FACTION_IDS } from '../types.js';
import {
  deLaListaBlocker,
  enteroBlocker,
  esIdDeUnidad,
  esObjeto,
  listaBlocker,
  problemasDeObjeto,
  repetidoEn,
} from '../validar.js';
import {
  A_QUIEN,
  AFECTA,
  AREA_MAXIMA,
  CANTIDAD_MAXIMA,
  CARGAS_MAXIMAS,
  CASILLAS_MAXIMAS,
  CIFRAS_DE_HECHIZO,
  CUANDO_SALTA,
  DISIPAR_DE,
  EFECTOS_MAXIMOS,
  ENTREGAS,
  esIdDeHechizo,
  GREMIO_MAXIMO,
  type Hechizo,
  IMPEDIBLES,
  INSTANTANEOS,
  LARGO_DE_LA_DESCRIPCION,
  LARGO_DEL_NOMBRE,
  MANA_MAXIMO,
  OBJETIVOS,
  RONDAS_MAXIMAS,
  TIPOS_DE_EFECTO,
  type TipoDeEfecto,
  TURNO_DE,
  VALOR_MAXIMO,
} from './formato.js';

const CAMPOS = [
  'id',
  'nombre',
  'descripcion',
  'mana',
  'gremio',
  'facciones',
  'entrega',
  'objetivo',
  'area',
  'afecta',
  'duracion',
  'seAcabaSiMuere',
  'efectos',
] as const;
const OBLIGATORIOS = [
  'id',
  'nombre',
  'descripcion',
  'mana',
  'gremio',
  'facciones',
  'entrega',
  'efectos',
];

/** Junta un prefijo con cada problema de una lista. */
function con(prefijo: string, problemas: readonly string[]): string[] {
  return problemas.map((p) => `${prefijo}: ${p}`);
}

function entero(v: unknown, min: number, max: number, campo: string): string[] {
  const m = enteroBlocker(v, min, max);
  return m === null ? [] : [`${campo} ${m}`];
}

function deLaLista(v: unknown, lista: readonly string[], campo: string): string[] {
  const m = deLaListaBlocker(v, lista);
  return m === null ? [] : [`${campo}: ${m}`];
}

function texto(v: unknown, campo: string, largo: number): string[] {
  if (typeof v !== 'string' || v.trim() === '') return [`${campo} tiene que ser un texto no vacío`];
  if (v.length > largo) return [`${campo} es de ${v.length} letras, y no pasa de ${largo}`];
  return [];
}

function booleano(v: unknown, campo: string): string[] {
  return v === undefined || typeof v === 'boolean' ? [] : [`${campo} tiene que ser true o false`];
}

/**
 * Lo que no vale de una lista de uno o varios de `valen`, sin repetir: la de lo
 * que impide un efecto y la de las facciones de un hechizo. `vacia` es la frase
 * de la lista sin nada.
 */
function problemasDeSubconjunto(
  v: unknown,
  valen: readonly string[],
  campo: string,
  vacia: string,
): string[] {
  const m = listaBlocker(v);
  if (m !== null) return [`${campo} ${m}`];
  const lista = v as readonly unknown[];
  if (lista.length === 0) return [`${campo} ${vacia}`];
  const out = lista.flatMap((x) => deLaLista(x, valen, campo));
  const rep = repetidoEn(lista);
  if (rep !== undefined) out.push(`${campo}: «${String(rep)}» va dos veces`);
  return out;
}

/** Lo que no vale de una cantidad: un entero de 1 en adelante o `{ base, porPoder }`. */
function problemasDeCantidad(v: unknown, campo: string): string[] {
  if (typeof v === 'number') return entero(v, 1, CANTIDAD_MAXIMA, campo);
  if (!esObjeto(v)) {
    return [`${campo} tiene que ser un número o { "base": n, "porPoder": m }`];
  }
  const forma = problemasDeObjeto(v, ['base', 'porPoder'], ['base', 'porPoder']);
  if (forma.length > 0) return con(campo, forma);
  return [
    ...entero(v.base, 0, CANTIDAD_MAXIMA, `${campo}.base`),
    ...entero(v.porPoder, 0, CANTIDAD_MAXIMA, `${campo}.porPoder`),
    ...(v.base === 0 && v.porPoder === 0 ? [`${campo} no puede ser 0 con 0`] : []),
  ];
}

/** Lo que no vale de una duración; `dentro`, si es la de un disparador (admite `portador`). */
function problemasDeDuracion(v: unknown, campo: string, dentro: boolean): string[] {
  if (v === 'pelea') return [];
  if (!esObjeto(v)) {
    return [
      `${campo} tiene que ser "pelea", { "rondas": n | "poder" } o { "hasta": "empezar" | "terminar", "turnoDe": … }`,
    ];
  }
  if ('rondas' in v) {
    const forma = problemasDeObjeto(v, ['rondas']);
    if (forma.length > 0) return con(campo, forma);
    return v.rondas === 'poder' ? [] : entero(v.rondas, 1, RONDAS_MAXIMAS, `${campo}.rondas`);
  }
  const forma = problemasDeObjeto(v, ['hasta', 'turnoDe'], ['hasta', 'turnoDe']);
  if (forma.length > 0) return con(campo, forma);
  const out = [
    ...deLaLista(v.hasta, ['empezar', 'terminar'], `${campo}.hasta`),
    ...deLaLista(v.turnoDe, TURNO_DE, `${campo}.turnoDe`),
  ];
  if (!dentro && v.turnoDe === 'portador') {
    out.push(`${campo}.turnoDe: «portador» solo vale dentro de un disparador`);
  }
  return out;
}

/**
 * Si lo que hace `o` (un hechizo o un disparador) dura, y lo que no vale de su
 * duración: que lo que dura diga cuánto, que lo del acto no lo diga, y la duración
 * misma (`problemasDeDuracion`). Con `aqui`, la de un disparador (cada frase con su
 * ruta delante; admite `portador`); sin él, la del hechizo. Lo leen los dos, que lo
 * escribían cada uno hasta la fase N de la reorganización (07-11-2026), con las mismas
 * frases en el mismo orden.
 */
function problemasDeLaDuracion(
  o: Record<string, unknown>,
  aqui?: string,
): { readonly dura: boolean; readonly problemas: string[] } {
  const efectos = Array.isArray(o.efectos) ? o.efectos : [];
  const dura = efectos.some(
    (e) =>
      esObjeto(e) && typeof e.tipo === 'string' && !INSTANTANEOS.includes(e.tipo as TipoDeEfecto),
  );
  const propias: string[] = [];
  if (dura && o.duracion === undefined) {
    propias.push('deja algo que dura y no dice cuánto («duracion»)');
  }
  if (!dura && o.duracion !== undefined) {
    propias.push('solo hace cosas en el acto, así que no lleva «duracion»');
  }
  const problemas = aqui === undefined ? propias : con(aqui, propias);
  if (o.duracion !== undefined) {
    const campo = aqui === undefined ? 'duracion' : `${aqui}.duracion`;
    problemas.push(...problemasDeDuracion(o.duracion, campo, aqui !== undefined));
  }
  return { dura, problemas };
}

const CAMPOS_DEL_EFECTO: Readonly<Record<TipoDeEfecto, readonly string[]>> = {
  danio: ['tipo', 'cantidad', 'armadura'],
  cura: ['tipo', 'cantidad'],
  disipar: ['tipo', 'de'],
  cifra: ['tipo', 'cifra', 'valor'],
  impide: ['tipo', 'que'],
  escudo: ['tipo', 'absorbe'],
  disparador: [
    'tipo',
    'cuando',
    'yAlLanzarse',
    'a',
    'radio',
    'afecta',
    'cargas',
    'duracion',
    'seAcabaSiMuere',
    'efectos',
  ],
  levantar: ['tipo', 'vivos', 'de'],
};

/** Lo que no vale de una lista de efectos; `dentro`, la de un disparador. */
function problemasDeEfectos(v: unknown, campo: string, dentro: boolean): string[] {
  const m = listaBlocker(v);
  if (m !== null) return [`${campo} ${m}`];
  const lista = v as readonly unknown[];
  if (lista.length === 0) return [`${campo} no tiene ningún efecto`];
  const out: string[] = [];
  if (lista.length > EFECTOS_MAXIMOS) {
    out.push(`${campo} lleva ${lista.length} efectos, y no pasan de ${EFECTOS_MAXIMOS}`);
  }
  out.push(...lista.flatMap((e, i) => problemasDelEfecto(e, `${campo}[${i}]`, dentro)));
  const cifras = lista.flatMap((e) =>
    esObjeto(e) && e.tipo === 'cifra' && typeof e.cifra === 'string' ? [e.cifra] : [],
  );
  const repetida = repetidoEn(cifras);
  if (repetida !== undefined) out.push(`${campo}: la cifra «${repetida}» va dos veces`);
  return out;
}

function problemasDelEfecto(v: unknown, campo: string, dentro: boolean): string[] {
  if (!esObjeto(v)) return [`${campo} tiene que ser un objeto`];
  const tipo = v.tipo;
  if (!(TIPOS_DE_EFECTO as readonly unknown[]).includes(tipo)) {
    return [`${campo}.tipo: ${deLaListaBlocker(tipo, TIPOS_DE_EFECTO)}`];
  }
  const t = tipo as TipoDeEfecto;
  const aqui = `${campo} (${t})`;
  const forma = problemasDeObjeto(v, CAMPOS_DEL_EFECTO[t]);
  if (forma.length > 0) return con(aqui, forma);
  switch (t) {
    case 'danio':
      return [
        ...problemasDeCantidad(v.cantidad, `${aqui}.cantidad`),
        ...(typeof v.armadura === 'boolean'
          ? []
          : [`${aqui}.armadura tiene que ser true (la resta) o false (llega entero)`]),
      ];
    case 'cura':
      return problemasDeCantidad(v.cantidad, `${aqui}.cantidad`);
    case 'disipar':
      return deLaLista(v.de, DISIPAR_DE, `${aqui}.de`);
    case 'cifra': {
      const out = [
        ...deLaLista(v.cifra, CIFRAS_DE_HECHIZO, `${aqui}.cifra`),
        ...entero(v.valor, -VALOR_MAXIMO, VALOR_MAXIMO, `${aqui}.valor`),
      ];
      if (v.valor === 0) out.push(`${aqui}.valor no puede ser 0: no haría nada`);
      return out;
    }
    case 'impide':
      return problemasDeSubconjunto(v.que, IMPEDIBLES, `${aqui}.que`, 'no impide nada');
    case 'escudo':
      return problemasDeCantidad(v.absorbe, `${aqui}.absorbe`);
    case 'disparador':
      return dentro
        ? [`${aqui}: un disparador no lleva otro dentro`]
        : problemasDelDisparador(v, aqui);
    case 'levantar':
      return dentro ? [`${aqui}: un disparador no levanta`] : problemasDeLevantar(v, aqui);
  }
}

/** Lo que no vale de un id de unidad del catálogo en `campo` (que exista lo mira la carga). */
function idDeUnidad(v: unknown, campo: string): string[] {
  return typeof v === 'string' && esIdDeUnidad(v)
    ? []
    : [`${campo} tiene que ser el id de una unidad (minúsculas, cifras y guiones)`];
}

/**
 * Lo que no vale de `levantar` por sí mismo: la unidad de los vivos y, si va, `de`
 * (id de lo que cae → id de lo que se levanta). Que las unidades existan y que lo
 * nombrado en `de` sea no-muerto lo dice `levantadosBlocker` (`unidad/formato.ts`),
 * con el catálogo de unidades delante; que vaya con un cadáver, `problemasDelAlcance`.
 */
function problemasDeLevantar(v: Record<string, unknown>, aqui: string): string[] {
  const out = idDeUnidad(v.vivos, `${aqui}.vivos`);
  if (v.de === undefined) return out;
  if (!esObjeto(v.de)) {
    out.push(`${aqui}.de tiene que ser un objeto { "id que cae": "id que se levanta" }`);
    return out;
  }
  const pares = Object.entries(v.de);
  if (pares.length === 0) out.push(`${aqui}.de no nombra a nadie: sin nada, se quita`);
  for (const [cae, sale] of pares) {
    if (!esIdDeUnidad(cae)) {
      out.push(`${aqui}.de: «${cae}» no es el id de una unidad (minúsculas, cifras y guiones)`);
    }
    out.push(...idDeUnidad(sale, `${aqui}.de.${cae}`));
  }
  return out;
}

function problemasDelDisparador(v: Record<string, unknown>, aqui: string): string[] {
  const out = [
    ...deLaLista(v.cuando, CUANDO_SALTA, `${aqui}.cuando`),
    ...deLaLista(v.a, A_QUIEN, `${aqui}.a`),
    ...booleano(v.yAlLanzarse, `${aqui}.yAlLanzarse`),
  ];
  const conOtro = v.cuando === 'alSerGolpeado' || v.cuando === 'alGolpear';
  if (v.a === 'otro' && !conOtro) {
    out.push(`${aqui}: «otro» solo vale con alSerGolpeado o alGolpear`);
  }
  if (v.cuando === 'alMorir' && v.a !== 'alrededor') {
    out.push(`${aqui}: alMorir solo vale con «alrededor» (quien lo lleva ya cayó)`);
  }
  if (v.yAlLanzarse === true && v.cuando !== 'empezarSuTurno' && v.cuando !== 'terminarSuTurno') {
    out.push(`${aqui}: «yAlLanzarse» solo vale con empezarSuTurno o terminarSuTurno`);
  }
  if (v.a === 'alrededor') {
    if (v.radio === undefined) out.push(`${aqui}: con «alrededor» falta «radio»`);
    else out.push(...entero(v.radio, 1, AREA_MAXIMA, `${aqui}.radio`));
    if (v.afecta === undefined) out.push(`${aqui}: con «alrededor» falta «afecta»`);
    else out.push(...deLaLista(v.afecta, AFECTA, `${aqui}.afecta`));
  } else {
    if (v.radio !== undefined) out.push(`${aqui}: «radio» solo con «alrededor»`);
    if (v.afecta !== undefined) out.push(`${aqui}: «afecta» solo con «alrededor»`);
  }
  if (v.cargas !== undefined) out.push(...entero(v.cargas, 1, CARGAS_MAXIMAS, `${aqui}.cargas`));
  out.push(...problemasDeEfectos(v.efectos, `${aqui}.efectos`, true));
  const { dura, problemas } = problemasDeLaDuracion(v, aqui);
  out.push(...problemas);
  if (v.seAcabaSiMuere !== undefined) {
    out.push(...deLaLista(v.seAcabaSiMuere, ['lanzador', 'portador'], `${aqui}.seAcabaSiMuere`));
    if (!dura) out.push(`${aqui}: «seAcabaSiMuere» solo con algo que dura`);
  }
  return out;
}

/** Lo que no vale de la entrega, el objetivo, el área y a quién afecta, juntos. */
function problemasDelAlcance(h: Record<string, unknown>): string[] {
  const e = h.entrega;
  if (!esObjeto(e)) return ['«entrega» tiene que ser un objeto con su «tipo»'];
  const tipoMal = deLaLista(e.tipo, ENTREGAS, 'entrega.tipo');
  if (tipoMal.length > 0) return tipoMal;
  const tipo = e.tipo as (typeof ENTREGAS)[number];
  const campos: Readonly<Record<typeof tipo, readonly string[]>> = {
    libre: ['tipo', 'diferido'],
    sobreSi: ['tipo'],
    contacto: ['tipo'],
    alcance: ['tipo', 'casillas', 'diferido'],
    proyectil: ['tipo', 'casillas', 'diferido'],
    tablero: ['tipo'],
  };
  const out = con(`entrega (${tipo})`, problemasDeObjeto(e, campos[tipo]));
  out.push(...booleano(e.diferido, 'entrega.diferido'));
  if (tipo === 'alcance') {
    if (e.casillas === undefined) out.push('entrega (alcance): falta «casillas»');
    else out.push(...entero(e.casillas, 1, CASILLAS_MAXIMAS, 'entrega.casillas'));
  }
  if (tipo === 'proyectil' && e.casillas !== undefined) {
    out.push(...entero(e.casillas, 1, CASILLAS_MAXIMAS, 'entrega.casillas'));
  }

  const sinObjetivo = tipo === 'sobreSi' || tipo === 'tablero';
  if (sinObjetivo && h.objetivo !== undefined) {
    out.push(`con la entrega «${tipo}» no se elige nada: sobra «objetivo»`);
  }
  if (!sinObjetivo) {
    if (h.objetivo === undefined) out.push('falta «objetivo»');
    else out.push(...deLaLista(h.objetivo, OBJETIVOS, 'objetivo'));
  }
  // Con un cadáver, lo dice `problemasDelCadaver` con su frase, y no dos veces.
  const alCadaver = h.objetivo === 'cadaver';
  if (tipo === 'proyectil' && h.objetivo !== undefined && h.objetivo !== 'casilla' && !alCadaver) {
    out.push('un proyectil se apunta a una casilla: «objetivo» tiene que ser "casilla"');
  }
  if (e.diferido === true && h.objetivo !== 'casilla' && !alCadaver) {
    out.push('lo diferido sale sobre una casilla: «objetivo» tiene que ser "casilla"');
  }
  if (alCadaver) out.push(...problemasDelCadaver(h, tipo));

  const area = h.area ?? 0;
  if (area === 'recta') {
    if (tipo !== 'proyectil') out.push('el área «recta» solo vale con la entrega «proyectil»');
  } else {
    out.push(...entero(area, 0, AREA_MAXIMA, 'area'));
  }
  if (tipo === 'tablero' && h.area !== undefined) out.push('con «tablero» no hay área: son todos');

  const pideAfecta =
    !alCadaver &&
    (tipo === 'tablero' ||
      tipo === 'proyectil' ||
      h.objetivo === 'casilla' ||
      (typeof area === 'number' && area > 0) ||
      area === 'recta');
  if (pideAfecta && h.afecta === undefined) {
    out.push('alcanza a quien esté donde caiga: falta «afecta» (aliados, enemigos o todos)');
  }
  if (!pideAfecta && h.afecta !== undefined && !alCadaver) {
    out.push('va a una sola unidad elegida: sobra «afecta» (lo dice «objetivo»)');
  }
  if (h.afecta !== undefined) out.push(...deLaLista(h.afecta, AFECTA, 'afecta'));
  return out;
}

/** Las entregas con que se apunta a un cadáver: las que eligen una casilla y caen en el acto. */
const ENTREGAS_DEL_CADAVER: readonly string[] = ['libre', 'contacto', 'alcance'];

/**
 * Lo que no vale de un hechizo que apunta a un cadáver (`objetivo: cadaver`): se
 * elige una casilla a un alcance (libre, en contacto o a x casillas; el proyectil
 * no, que da al primero vivo de la recta), cae en el acto (sin «diferido»: el
 * cadáver podría ya no estar), es uno y lo levanta (sin área ni «afecta», que son
 * de los vivos que alcanza) y su único efecto es `levantar`, sin duración (lo
 * levantado no dura: se queda). Y `levantar` no va con otro objetivo.
 */
function problemasDelCadaver(h: Record<string, unknown>, tipo: string): string[] {
  const out: string[] = [];
  if (!ENTREGAS_DEL_CADAVER.includes(tipo)) {
    out.push(
      `a un cadáver se llega con la entrega ${ENTREGAS_DEL_CADAVER.map((t) => `«${t}»`).join(', ')}, no con «${tipo}»`,
    );
  }
  if (esObjeto(h.entrega) && h.entrega.diferido === true) {
    out.push('a un cadáver no se lanza diferido: al caer, el cadáver podría ya no estar');
  }
  if (h.area !== undefined && h.area !== 0) {
    out.push('a un cadáver no hay área: se levanta uno');
  }
  if (h.afecta !== undefined) {
    out.push('a un cadáver sobra «afecta»: no alcanza a nadie vivo');
  }
  const efectos = Array.isArray(h.efectos) ? h.efectos : [];
  const levantan = efectos.filter((e) => esObjeto(e) && e.tipo === 'levantar').length;
  if (levantan !== 1 || efectos.length !== 1) {
    out.push('a un cadáver se lanza un solo efecto, «levantar»');
  }
  return out;
}

/** Que `levantar` vaya solo con el objetivo `cadaver`. */
function problemasDeLevantarSinCadaver(h: Record<string, unknown>): string[] {
  if (h.objetivo === 'cadaver' || !Array.isArray(h.efectos)) return [];
  return h.efectos.some((e) => esObjeto(e) && e.tipo === 'levantar')
    ? ['«levantar» solo va con el objetivo «cadaver»: se levanta de un cadáver']
    : [];
}

/**
 * Todo lo que no vale de un hechizo, cada frase con su nombre (o su posición) y
 * su ruta. Vacío, vale.
 */
export function problemasDelHechizo(crudo: unknown, cual = 'el hechizo'): string[] {
  if (!esObjeto(crudo)) return [`${cual} tiene que ser un objeto`];
  const h = crudo;
  const quien = typeof h.nombre === 'string' && h.nombre !== '' ? `«${h.nombre}»` : cual;
  const out: string[] = problemasDeObjeto(h, CAMPOS, OBLIGATORIOS);
  if (typeof h.id !== 'string' || !esIdDeHechizo(h.id)) {
    out.push(
      `el id ${JSON.stringify(h.id)} no vale: minúsculas, cifras y «_», empezando por letra o cifra, hasta ${LARGO_DEL_NOMBRE}`,
    );
  }
  out.push(...texto(h.nombre, 'el nombre', LARGO_DEL_NOMBRE));
  out.push(...texto(h.descripcion, 'la descripción', LARGO_DE_LA_DESCRIPCION));
  out.push(...entero(h.mana, 0, MANA_MAXIMO, 'el maná'));
  if (h.gremio !== null) out.push(...entero(h.gremio, 1, GREMIO_MAXIMO, 'el gremio'));
  // Con `in` y no `!== undefined`: un `"facciones": undefined` se dice como «no es
  // una lista»; la clave ausente ya la dice `problemasDeObjeto` («falta»). Vacía no
  // vale: un hechizo «de ninguna» no lo enseñaría ningún gremio ni lo usaría ninguna
  // unidad (08-11-2026).
  if ('facciones' in h) {
    out.push(
      ...problemasDeSubconjunto(
        h.facciones,
        FACTION_IDS,
        'facciones',
        'está vacía: un hechizo es de una facción o de varias',
      ),
    );
  }
  out.push(...problemasDelAlcance(h));
  out.push(...problemasDeEfectos(h.efectos, 'efectos', false));
  out.push(...problemasDeLevantarSinCadaver(h));
  const { dura, problemas } = problemasDeLaDuracion(h);
  out.push(...problemas);
  if (h.seAcabaSiMuere !== undefined) {
    if (h.seAcabaSiMuere !== 'lanzador') {
      out.push('«seAcabaSiMuere» de un hechizo solo vale "lanzador"');
    }
    if (!dura) out.push('«seAcabaSiMuere» solo con algo que dura');
  }
  return con(quien, out);
}

/** Lo que no vale de un hechizo que usa una unidad como poder (su poder mágico es 0). */
export function problemasComoPoder(h: Hechizo): string[] {
  const out: string[] = [];
  const mira = (d: unknown, donde: string): void => {
    if (esObjeto(d) && d.rondas === 'poder') {
      out.push(`${donde}: una unidad no tiene poder mágico: «rondas: poder» duraría siempre 1`);
    }
  };
  const cantidad = (c: unknown, donde: string): void => {
    if (esObjeto(c) && typeof c.porPoder === 'number' && c.porPoder > 0) {
      out.push(`${donde}: una unidad no tiene poder mágico: «porPoder» no sumaría nada`);
    }
  };
  mira(h.duracion, 'duracion');
  const recorrer = (efectos: readonly unknown[], donde: string): void => {
    efectos.forEach((e, i) => {
      if (!esObjeto(e)) return;
      const aqui = `${donde}[${i}]`;
      cantidad(e.cantidad, aqui);
      cantidad(e.absorbe, aqui);
      if (e.tipo === 'disparador') {
        mira(e.duracion, `${aqui}.duracion`);
        recorrer(Array.isArray(e.efectos) ? e.efectos : [], `${aqui}.efectos`);
      }
    });
  };
  recorrer(h.efectos, 'efectos');
  return con(`«${h.nombre}» como poder`, out);
}

/**
 * Lee el catálogo entero (`{ hechizos: [...] }`, con su `_comment`) y lanza con
 * todos sus problemas a la vez, nombrando el fichero. Ni ids ni nombres
 * repetidos.
 */
export function leerHechizos(json: unknown, fichero = 'data/hechizos.json'): readonly Hechizo[] {
  const problemas = problemasDelCatalogo(json);
  if (problemas.length > 0) throw new Error(`${fichero}:\n- ${problemas.join('\n- ')}`);
  return (json as { hechizos: readonly Hechizo[] }).hechizos;
}

/** Lo que no vale del catálogo: cada hechizo y lo repetido. Vacío, vale. */
function problemasDelCatalogo(json: unknown): string[] {
  const forma = problemasDeObjeto(json, ['_comment', 'hechizos'], ['hechizos']);
  if (forma.length > 0) return forma;
  const lista = (json as { hechizos: unknown }).hechizos;
  const m = listaBlocker(lista);
  if (m !== null) return [`«hechizos» ${m}`];
  return problemasDeLaLista(lista as readonly unknown[]);
}

/** Lo que no vale de una lista de hechizos: cada uno y lo repetido. */
export function problemasDeLaLista(lista: readonly unknown[]): string[] {
  const out = lista.flatMap((h, i) => problemasDelHechizo(h, `el hechizo ${i + 1}`));
  const ids = lista.flatMap((h) => (esObjeto(h) && typeof h.id === 'string' ? [h.id] : []));
  const nombres = lista.flatMap((h) =>
    esObjeto(h) && typeof h.nombre === 'string' ? [h.nombre] : [],
  );
  const id = repetidoEn(ids);
  if (id !== undefined) out.push(`el id «${id}» está dos veces`);
  const nombre = repetidoEn(nombres);
  if (nombre !== undefined) out.push(`el nombre «${nombre}» está dos veces`);
  return out;
}
