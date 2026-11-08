/**
 * Lo que no vale de un hechizo y del catálogo de hechizos, **todo a la vez**: la
 * página del editor enseña la lista entera y la carga del juego lanza con ella.
 * Cada frase dice dónde («efectos[0] (disparador): …»). Lo que no se juzga: si el
 * hechizo tiene sentido (un Berserker que hiere al aliado vale) ni su coste.
 */
import {
  deLaListaBlocker,
  enteroBlocker,
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
  'entrega',
  'objetivo',
  'area',
  'afecta',
  'duracion',
  'seAcabaSiMuere',
  'efectos',
] as const;
const OBLIGATORIOS = ['id', 'nombre', 'descripcion', 'mana', 'gremio', 'entrega', 'efectos'];

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
    case 'impide': {
      const m = listaBlocker(v.que);
      if (m !== null) return [`${aqui}.que ${m}`];
      const que = v.que as readonly unknown[];
      if (que.length === 0) return [`${aqui}.que no impide nada`];
      const out = que.flatMap((q) => deLaLista(q, IMPEDIBLES, `${aqui}.que`));
      const rep = repetidoEn(que);
      if (rep !== undefined) out.push(`${aqui}.que: «${String(rep)}» va dos veces`);
      return out;
    }
    case 'escudo':
      return problemasDeCantidad(v.absorbe, `${aqui}.absorbe`);
    case 'disparador':
      return dentro
        ? [`${aqui}: un disparador no lleva otro dentro`]
        : problemasDelDisparador(v, aqui);
  }
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
  if (tipo === 'proyectil' && h.objetivo !== undefined && h.objetivo !== 'casilla') {
    out.push('un proyectil se apunta a una casilla: «objetivo» tiene que ser "casilla"');
  }
  if (e.diferido === true && h.objetivo !== 'casilla') {
    out.push('lo diferido sale sobre una casilla: «objetivo» tiene que ser "casilla"');
  }

  const area = h.area ?? 0;
  if (area === 'recta') {
    if (tipo !== 'proyectil') out.push('el área «recta» solo vale con la entrega «proyectil»');
  } else {
    out.push(...entero(area, 0, AREA_MAXIMA, 'area'));
  }
  if (tipo === 'tablero' && h.area !== undefined) out.push('con «tablero» no hay área: son todos');

  const pideAfecta =
    tipo === 'tablero' ||
    tipo === 'proyectil' ||
    h.objetivo === 'casilla' ||
    (typeof area === 'number' && area > 0) ||
    area === 'recta';
  if (pideAfecta && h.afecta === undefined) {
    out.push('alcanza a quien esté donde caiga: falta «afecta» (aliados, enemigos o todos)');
  }
  if (!pideAfecta && h.afecta !== undefined) {
    out.push('va a una sola unidad elegida: sobra «afecta» (lo dice «objetivo»)');
  }
  if (h.afecta !== undefined) out.push(...deLaLista(h.afecta, AFECTA, 'afecta'));
  return out;
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
  out.push(...problemasDelAlcance(h));
  out.push(...problemasDeEfectos(h.efectos, 'efectos', false));
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
