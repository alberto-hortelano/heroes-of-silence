/**
 * El enlace de una pelea (`?montaje=`): el montaje entero en la URL, con su versión
 * (`VERSION_DEL_ENLACE`), leído estricto, y los parámetros retirados que se
 * rechazan diciéndolo.
 *
 * Era parte de `core/arena.ts`, repartido en `arena/` en la fase N de la
 * reorganización (07-11-2026); lo que hace la arena y por qué, en `montaje.ts`.
 */
import { validarMuralla } from '../battle/muralla.js';
import type { MurallaDeBatalla } from '../battle/types.js';
import { combateBlocker, type ReglasDelCombate } from '../combate.js';
import { type CatalogoDeEquipo, catalogoDeEquipo } from '../equipo/atado.js';
import { EQUIPO_ESCRITO, type PiezaEscrita, validarPieza } from '../equipo/pieza.js';
import {
  type CatalogoDeHechizos,
  catalogoDeHechizos,
  HECHIZOS_DEL_JUEGO,
  hechizo,
} from '../magia/catalogo.js';
import type { Hechizo } from '../magia/formato.js';
import { problemasDeLaLista } from '../magia/validar.js';
import { type Unidad, validarUnidad } from '../unidad/formato.js';
import { lista, sinRepetir, texto } from '../validar.js';
import { type HeroeDeArena, heroeDeArena, validarHeroeDeArena } from './heroe.js';
import { type FuenteDeArena, LADOS, type Lado } from './lados.js';
import {
  despliegueDeArenaBlocker,
  escaleraDeArenaBlocker,
  type LadoDeArena,
  type MontajeDeArena,
  topeDelBandoBlocker,
} from './montaje.js';
import { conPiezas, piezasDelMontaje } from './piezas.js';

// ------------------------------------------------------------- el enlace de la pelea

/**
 * Un puesto del montaje tal como va en el enlace: una unidad del catálogo (sus
 * cifras van en `MontajeDelEnlace.unidades`) y si lleva escalera.
 */
export interface PuestoDelEnlace {
  readonly unidad: string;
  readonly escalera: boolean;
}

/** Un lado del enlace: quién lo mueve, entero —la persona o la IA—, sus puestos y su héroe. */
interface LadoDelEnlace {
  readonly ia: boolean;
  readonly puestos: readonly PuestoDelEnlace[];
  readonly heroe: HeroeDeArena | null;
}

/** Quién mueve cada bando si nada lo dice: la izquierda, la persona; la derecha, la IA. */
export const IA_POR_DEFECTO: Readonly<Record<Lado, boolean>> = { izquierda: false, derecha: true };

/**
 * El montaje entero que viaja en la URL de la arena (`?montaje=`), con la
 * semilla en su propio parámetro: abrir el enlace monta la misma
 * pelea (H6 de QA, decisión del usuario del 09-10-2026). Las cifras van por
 * TIPO, como las lleva la página: dos monjes son un monje en `unidades`.
 */
export interface MontajeDelEnlace {
  /** Las cifras de cada unidad montada, guardadas o no, en el orden en que salen. */
  readonly unidades: readonly Unidad[];
  /**
   * Todas las piezas que lleva lo montado, con sus bases (`piezasDelMontaje`), tal
   * como las tenía quien lo copió: al abrirlo entran en el catálogo de quien lo
   * abre como cambios sin guardar (`conPiezas`), y la pelea del enlace pelea igual
   * en otra máquina.
   */
  readonly piezas: readonly PiezaEscrita[];
  /**
   * Los hechizos que usa lo montado (el libro de cada héroe y los poderes de las
   * unidades), tal como los tenía quien lo copió (versión 21, el editor de magia;
   * 22, sus facciones): al abrirlo entran en los de quien lo abre como cambios sin
   * guardar.
   */
  readonly hechizos: readonly Hechizo[];
  readonly izquierda: LadoDelEnlace;
  readonly derecha: LadoDelEnlace;
  /** La muralla del tablero, o `null` sin ella. */
  readonly muralla: MurallaDeBatalla | null;
  /** La complejidad de la pelea: el tope por bando y la rueda (versión 14). */
  readonly combate: ReglasDelCombate;
}

/**
 * Los parámetros de la URL que la arena ya no lee (19-10-2026): los interruptores
 * de las reglas de fheroes2 (`reglas`) y de los modos (`golpe`, `contacto`). La
 * arena pelea con las reglas del juego, sin interruptores; un enlace de antes con
 * ellos pelearía otra pelea que la que dice, así que no se ignoran: se rechazan.
 */
const PARAMETROS_RETIRADOS = ['reglas', 'golpe', 'contacto'] as const;
type ParametroRetirado = (typeof PARAMETROS_RETIRADOS)[number];

/**
 * Los parámetros retirados que trae la URL (`nombres`, sus claves), cada uno con
 * su motivo para la persona: «la arena pelea con las reglas del juego: quita
 * «?reglas=» de la dirección». Lo lee la página al abrir.
 */
export function retiradosDeLaURL(
  nombres: Iterable<string>,
): readonly { readonly nombre: ParametroRetirado; readonly motivo: string }[] {
  const hay = new Set(nombres);
  return PARAMETROS_RETIRADOS.filter((n) => hay.has(n)).map((nombre) => ({
    nombre,
    motivo: `la arena pelea con las reglas del juego: quita «?${nombre}=» de la dirección`,
  }));
}

/**
 * La versión del formato. **Se lee solo la de hoy** (14-10-2026, el usuario: «no
 * queremos mantener compatibilidad hacia atrás, estamos en pleno desarrollo»): un
 * enlace de otra se rechaza diciendo que se vuelva a copiar, sin convertir nada.
 * Cambiar el formato es subirla: la 12 (18-10-2026) trae todas las piezas que
 * lleva lo montado, de la única clase que queda, sin calidad ni PV; la 13
 * (19-10-2026) no cambia el formato, cambian las reglas: sin interruptores, con
 * la rueda, el contacto y la carga a pie siempre, el montaje de antes pelearía
 * otra pelea sin decirlo; la 14 (22-10-2026) trae la complejidad de la pelea
 * (`combate`: el tope por bando y la rueda); la 15 (25-10-2026), la fuerza, la
 * agilidad y el peso: las unidades sin defensa, daño ni casillas y las piezas sin
 * velocidad ni daño; la 16 (25-10-2026), la segunda arma: el hueco `lanza` se fue,
 * una pieza dice `lanza: true` y una unidad lleva `segunda`; la 17 (26-10-2026), la
 * montura: el hueco `montura`, piezas con `agilidad` y `guerra`, y el rasgo
 * `charge` fuera; la 18 (03-11-2026), el cuerpo de todo héroe en cada héroe
 * (`HeroeDeArena.cuerpo`: PV, fuerza y agilidad, que la arena edita); la 19
 * (04-11-2026), lo que lleva puesto cada héroe (`HeroeDeArena.equipo`); la 20
 * (04-11-2026, puesto fronterizo, fase 2; fusionada el 05-11-2026), el material
 * de la muralla (`MurallaDeBatalla.material`: piedra o madera); la 21
 * (06-11-2026), los hechizos de lo montado, enteros (el editor de magia); la 22
 * (08-11-2026), las facciones de cada hechizo (`Hechizo.facciones`): un hechizo de
 * la 21 diría «falta facciones» en vez de pedir que se vuelva a copiar.
 */
export const VERSION_DEL_ENLACE = 22;

const CAMPOS_DEL_ENLACE = [
  'v',
  'unidades',
  'piezas',
  'hechizos',
  'izquierda',
  'derecha',
  'muralla',
  'combate',
];
const CAMPOS_DEL_COMBATE = ['tope', 'rueda'];
const CAMPOS_DEL_LADO = ['ia', 'puestos', 'heroe'];
const CAMPOS_DEL_PUESTO = ['unidad', 'escalera'];
const CAMPOS_DEL_HEROE = [
  'nombre',
  'figura',
  'ataque',
  'defensa',
  'poder',
  'conocimiento',
  'hechizos',
  'cuerpo',
  'equipo',
];

/** Un objeto con solo esos campos, o se lanza diciendo cuál sobra o falta. */
function objetoCon(
  valor: unknown,
  campos: readonly string[],
  quien: string,
): Record<string, unknown> {
  if (typeof valor !== 'object' || valor === null || Array.isArray(valor)) {
    throw new Error(`${quien} tiene que ser un objeto`);
  }
  const o = valor as Record<string, unknown>;
  const ajeno = Object.keys(o).find((k) => !campos.includes(k));
  if (ajeno !== undefined) throw new Error(`${quien}: «${ajeno}» no es un campo del enlace`);
  const falta = campos.find((k) => !(k in o));
  if (falta !== undefined) throw new Error(`${quien}: falta «${falta}»`);
  return o;
}

function siONo(valor: unknown, quien: string, campo = 'ia'): boolean {
  if (typeof valor !== 'boolean')
    throw new Error(`${quien}: «${campo}» tiene que ser true o false`);
  return valor;
}

/**
 * Lee el montaje de `?montaje=` y lo comprueba entero antes de devolver nada:
 * un enlace mal formado, de otra versión o con una unidad o un hechizo que no
 * existen lanza diciendo qué, y la página no monta nada a medias. Que las hojas
 * tengan arte lo mira la página, que es quien las tiene.
 *
 * Las unidades se leen con las piezas del enlace, que trae todas las que lleva lo
 * montado (encima de las del juego, `conPiezas`, para que el catálogo sea entero).
 * Una unidad que con ellas no vale no se monta, y se dice por qué.
 */
export function montajeDeLaURL(textoDelEnlace: string): MontajeDelEnlace {
  let crudo: unknown;
  try {
    crudo = JSON.parse(textoDelEnlace);
  } catch (err) {
    throw new Error(
      `el montaje del enlace no se puede leer (${err instanceof Error ? err.message : String(err)}): puede que se cortara al copiarlo`,
    );
  }
  const v =
    typeof crudo === 'object' && crudo !== null && 'v' in crudo
      ? (crudo as { v: unknown }).v
      : null;
  if (v !== VERSION_DEL_ENLACE) {
    throw new Error(
      typeof v === 'number' && Number.isInteger(v) && v >= 1 && v < VERSION_DEL_ENLACE
        ? `este enlace es de una versión anterior de la arena (la ${v}; la de hoy es la ${VERSION_DEL_ENLACE}): vuelve a copiarlo`
        : `el montaje del enlace es de la versión ${JSON.stringify(v)} y esta arena lee la ${VERSION_DEL_ENLACE}`,
    );
  }
  const o = objetoCon(crudo, CAMPOS_DEL_ENLACE, 'el montaje del enlace');
  // Las piezas del enlace, una a una con la regla de una pieza; con ellas pelea.
  const piezas = lista(o.piezas, 'las piezas', 'el montaje del enlace').map((crudo) => {
    try {
      return validarPieza(crudo);
    } catch (err) {
      throw new Error(
        `una pieza del enlace no vale: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  });
  sinRepetir(
    piezas.map((p) => p.id),
    'la pieza',
    'el montaje del enlace',
  );
  const conLasPiezas = catalogoDeEquipo(conPiezas(EQUIPO_ESCRITO, piezas));
  // La primera unidad que no vale tumba el enlace.
  const unidades = lista(o.unidades, 'las unidades', 'el montaje del enlace').map((c) =>
    validarUnidad(c, conLasPiezas),
  );
  sinRepetir(
    unidades.map((u) => u.id),
    'la unidad',
    'el montaje del enlace',
  );
  const c = objetoCon(o.combate, CAMPOS_DEL_COMBATE, 'la complejidad del enlace');
  const combate = { tope: c.tope, rueda: c.rueda } as ReglasDelCombate;
  const sinCombate = combateBlocker(combate);
  if (sinCombate !== null) throw new Error(`la complejidad del enlace no vale: ${sinCombate}`);
  const izquierda = ladoDelEnlace(o.izquierda, 'izquierda', combate.tope);
  const derecha = ladoDelEnlace(o.derecha, 'derecha', combate.tope);
  // El cuerpo es el de todo héroe: dos distintos no los escribe la página.
  if (
    izquierda.heroe !== null &&
    derecha.heroe !== null &&
    JSON.stringify(izquierda.heroe.cuerpo) !== JSON.stringify(derecha.heroe.cuerpo)
  ) {
    throw new Error(
      'los dos héroes del enlace llevan cuerpos distintos, y el cuerpo es el de todo héroe',
    );
  }
  let muralla: MurallaDeBatalla | null = null;
  if (o.muralla !== null) {
    try {
      muralla = validarMuralla(o.muralla);
    } catch (err) {
      throw new Error(
        `la muralla del enlace no vale: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
  // Cada cifra del enlace es de un puesto montado, y cada hoja montada trae las
  // suyas: lo que sobra o falta no es un enlace que haya escrito la página.
  const puestos = [...izquierda.puestos, ...derecha.puestos];
  for (const p of puestos) {
    if (!unidades.some((u) => u.id === p.unidad)) {
      throw new Error(`el montaje del enlace pone «${p.unidad}» y no trae sus cifras`);
    }
  }
  for (const u of unidades) {
    if (!puestos.some((p) => p.unidad === u.id)) {
      throw new Error(`el montaje del enlace trae las cifras de «${u.id}» y no la monta`);
    }
  }
  // Las trae todas, y cada una la lleva alguien: lo que falta o sobra no lo
  // escribió la página.
  const llevadas = (() => {
    try {
      return piezasDelMontaje(
        unidades,
        [izquierda.heroe, derecha.heroe].flatMap((h) => (h === null ? [] : [h.equipo])),
        piezas,
      );
    } catch (err) {
      throw new Error(
        `el montaje del enlace no trae una pieza: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  })();
  for (const p of piezas) {
    if (!llevadas.includes(p)) {
      throw new Error(`el montaje del enlace trae la pieza «${p.nombre}» y no la lleva nadie`);
    }
  }
  // Y lo que lleva cada héroe, con la regla de su ficha (`heroeDeArena`).
  for (const [l, h] of [
    ['izquierda', izquierda.heroe],
    ['derecha', derecha.heroe],
  ] as const) {
    if (h === null) continue;
    try {
      heroeDeArena(h, conLasPiezas);
    } catch (err) {
      throw new Error(
        `el héroe del bando ${LADOS[l].adjetivo} del enlace no vale: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
  // Los hechizos del enlace: cada uno vale, y son justo los que usa lo montado.
  const hechizosCrudos = lista(o.hechizos, 'los hechizos', 'el montaje del enlace');
  const problemas = problemasDeLaLista(hechizosCrudos);
  if (problemas.length > 0) {
    throw new Error(`un hechizo del enlace no vale: ${problemas.join('; ')}`);
  }
  const hechizos = hechizosCrudos as readonly Hechizo[];
  const usados = idsDeHechizosDelMontaje(
    unidades,
    [izquierda.heroe, derecha.heroe].flatMap((h) => (h === null ? [] : [h])),
  );
  for (const id of usados) {
    if (!hechizos.some((h) => h.id === id)) {
      throw new Error(`el montaje del enlace usa el hechizo «${id}» y no lo trae`);
    }
  }
  for (const h of hechizos) {
    if (!usados.includes(h.id)) {
      throw new Error(`el montaje del enlace trae el hechizo «${h.nombre}» y no lo usa nadie`);
    }
  }
  const montaje = { unidades, piezas, hechizos, izquierda, derecha, muralla, combate };
  // Que quepa en sus columnas de salida y que nadie lleve una escalera que no
  // usaría, con las mismas preguntas que el montaje de la página: un enlace no
  // monta lo que la página no dejaría montar.
  const delEnlace = montajeDeArenaDelEnlace(montaje, conLasPiezas);
  const despliegue = despliegueDeArenaBlocker(delEnlace);
  if (despliegue !== null) throw new Error(`el montaje del enlace no cabe: ${despliegue}`);
  for (const lado of ['izquierda', 'derecha'] as const) {
    delEnlace[lado].unidades.forEach((fuente, i) => {
      if (fuente.escalera !== true) return;
      const motivo = escaleraDeArenaBlocker(fuente, lado, conLasPiezas);
      if (motivo !== null) {
        throw new Error(
          `el bando ${LADOS[lado].adjetivo} del enlace, puesto ${i + 1}, lleva escalera y ${motivo}`,
        );
      }
    });
  }
  return montaje;
}

/**
 * El montaje con el que pelea un enlace ya leído, con este catálogo de equipo: las fuentes de cada puesto (la unidad con sus cifras) y la
 * muralla. El catálogo lo da quien lo abre (el suyo con las piezas del enlace,
 * `conPiezas`). Lo que mueve la IA no es del montaje: lo lee la página del enlace.
 */
export function montajeDeArenaDelEnlace(
  m: MontajeDelEnlace,
  equipo: CatalogoDeEquipo,
): MontajeDeArena {
  const lado = (l: LadoDelEnlace): LadoDeArena => ({
    unidades: l.puestos.map((p): FuenteDeArena => {
      const unidad = m.unidades.find((u) => u.id === p.unidad);
      if (unidad === undefined) {
        throw new Error(`el montaje del enlace pone «${p.unidad}» y no trae sus cifras`);
      }
      return { unidad, escalera: p.escalera };
    }),
    heroe: l.heroe,
  });
  return {
    izquierda: lado(m.izquierda),
    derecha: lado(m.derecha),
    ...(m.muralla === null ? {} : { muralla: m.muralla }),
    combate: m.combate,
    equipo,
    hechizos: catalogoDeHechizos([
      ...[...HECHIZOS_DEL_JUEGO.values()].filter((h) => !m.hechizos.some((x) => x.id === h.id)),
      ...m.hechizos,
    ]),
  };
}

/**
 * Los ids de los hechizos que usa lo montado, sin repetir y en orden: el libro de
 * cada héroe y los poderes de cada unidad (`Unidad.hechizos`). Lo que viaja en el
 * enlace.
 */
function idsDeHechizosDelMontaje(
  unidades: readonly Unidad[],
  heroes: readonly HeroeDeArena[],
): readonly string[] {
  const ids = [...heroes.flatMap((h) => h.hechizos), ...unidades.flatMap((u) => u.hechizos ?? [])];
  return ids.filter((id, i) => ids.indexOf(id) === i);
}

/** Los hechizos que usa lo montado, de `cat`; lanza con uno que no está. */
export function hechizosDelMontaje(
  unidades: readonly Unidad[],
  heroes: readonly HeroeDeArena[],
  cat: CatalogoDeHechizos,
): readonly Hechizo[] {
  return idsDeHechizosDelMontaje(unidades, heroes).map((id) => hechizo(id, cat));
}

/** Un lado del enlace, comprobado. */
function ladoDelEnlace(valor: unknown, lado: Lado, tope: number): LadoDelEnlace {
  const quien = `el bando ${LADOS[lado].adjetivo} del enlace`;
  const delHeroe = `el héroe del bando ${LADOS[lado].adjetivo} del enlace`;
  const o = objetoCon(valor, CAMPOS_DEL_LADO, quien);
  const puestos = lista(o.puestos, 'los puestos', quien).map((crudo, i): PuestoDelEnlace => {
    const q = `${quien}, puesto ${i + 1}`;
    const p = objetoCon(crudo, CAMPOS_DEL_PUESTO, q);
    return {
      unidad: texto(p.unidad, 'la unidad', q),
      escalera: siONo(p.escalera, q, 'escalera'),
    };
  });
  let heroe: HeroeDeArena | null = null;
  if (o.heroe !== null) {
    const h = objetoCon(o.heroe, CAMPOS_DEL_HEROE, delHeroe);
    if (h.figura !== null && typeof h.figura !== 'string') {
      throw new Error(`${delHeroe}: la figura tiene que ser el id de una hoja o null`);
    }
    heroe = validarHeroeDeArena(h as unknown as HeroeDeArena);
  }
  const noCabe = topeDelBandoBlocker(quien, puestos.length, heroe !== null, tope);
  if (noCabe !== null) throw new Error(noCabe);
  return { ia: siONo(o.ia, quien), puestos, heroe };
}

/**
 * El texto de `?montaje=`, la inversa exacta de `montajeDeLaURL`. Se escribe lo
 * que se LEE de él: así un montaje que no se podría abrir no llega a un enlace, y
 * el texto sale con el orden de campos de los validadores, el mismo cada vez.
 */
export function montajeALaURL(m: MontajeDelEnlace): string {
  return textoDelMontaje(montajeDeLaURL(textoDelMontaje(m)));
}

function textoDelMontaje(m: MontajeDelEnlace): string {
  const lado = (l: LadoDelEnlace) => ({
    ia: l.ia,
    puestos: l.puestos.map((p) => ({ unidad: p.unidad, escalera: p.escalera })),
    heroe: l.heroe,
  });
  return JSON.stringify({
    v: VERSION_DEL_ENLACE,
    unidades: m.unidades,
    piezas: m.piezas,
    hechizos: m.hechizos,
    izquierda: lado(m.izquierda),
    derecha: lado(m.derecha),
    muralla: m.muralla,
    combate: { tope: m.combate.tope, rueda: m.combate.rueda },
  });
}
