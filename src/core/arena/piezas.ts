/**
 * Lo que la arena hace con las piezas: equipar y quitar a una unidad o un héroe, el
 * editor del catálogo (una pieza nueva, sobre otra, con su base), lo que deja de
 * valer al cambiarla y las piezas que lleva un montaje.
 *
 * Era parte de `core/arena.ts`, repartido en `arena/` en la fase N de la
 * reorganización (07-11-2026); lo que hace la arena y por qué, en `montaje.ts`.
 */
import { ruedaDelArmaEnPalabras } from '../battle/rueda.js';
import type { FichaEnPalabras } from '../battle/types.js';
import { type CatalogoDeEquipo, catalogoDeEquipo, type EquipoAtado } from '../equipo/atado.js';
import { aDosManos, nadaEnElHueco, quitarPieza } from '../equipo/manos.js';
import {
  baseBlocker,
  diferenciaDe,
  esPiezaConBase,
  type Pieza,
  type PiezaEscrita,
  validarPieza,
} from '../equipo/pieza.js';
import { idsPuestos } from '../equipo/vestir.js';
import {
  type CifraDePieza,
  camposDelHueco,
  describirCoste,
  type Equipo,
  type Hueco,
  type HuecoDePieza,
  huecosDeLaPieza,
  NOMBRE_DE_HUECO,
  type UnitInfo,
} from '../types.js';
import { AGILIDAD_DEL_CUERPO_MIN } from '../unidad/cuerpo.js';
import {
  CUERPO_COMUN,
  cuerpoDeCombate,
  equipoDeUnidadBlocker,
  leerCatalogos,
  nivelesDeLaEspada,
  type Unidad,
} from '../unidad/formato.js';
import { cuerpoDelHeroeDeArena, type HeroeDeArena } from './heroe.js';

/**
 * La unidad con la pieza `id` de `eq` (el catálogo que edita la arena,
 * `catalogoDeEquipo`) puesta en `hueco` (el suyo si no se dice; un arma, también en
 * `segunda`): lo que hubiera ahí se quita. Lanza con el motivo de `ponerPieza`
 * (`manosBlocker`: un arma a dos manos va sola) diciendo a quién.
 */
export function equiparEnArena<T extends Unidad | HeroeDeArena>(
  u: T,
  id: string,
  eq: EquipoAtado,
  hueco?: Hueco,
): T {
  return { ...u, equipo: eq.ponerPieza(u.equipo, id, nombreDe(u), hueco).equipo };
}

/** La unidad o el héroe sin lo que lleve en `hueco`; si no lleva nada ahí, se dice. */
export function quitarEnArena<T extends Unidad | HeroeDeArena>(u: T, hueco: Hueco): T {
  const { equipo, quitada } = quitarPieza(u.equipo, hueco);
  if (quitada === null) throw new Error(nadaEnElHueco(nombreDe(u), hueco));
  return { ...u, equipo };
}

/** El nombre de quien lleva el equipo: la unidad (`name`) o el héroe (`nombre`). */
function nombreDe(u: Unidad | HeroeDeArena): string {
  return 'nombre' in u ? u.nombre : u.name;
}

/**
 * Quien lleva equipo en la arena, con su cuerpo sin él: una unidad del catálogo
 * (`cuerpoDeCombate`) o el héroe de un bando (`cuerpoDelHeroeDeArena`). Lo leen las
 * preguntas del equipo (`opcionesDelHueco`, `quitarBlocker`) y lo que deja de valer
 * al cambiar una pieza (`cambioDePiezas`): la misma regla para los dos,
 * `equipoDeUnidadBlocker`.
 */
interface Portador {
  readonly nombre: string;
  readonly cuerpo: UnitInfo;
  readonly equipo: Equipo;
}

function portadorDe(u: Unidad | HeroeDeArena): Portador {
  return 'nombre' in u
    ? { nombre: u.nombre, cuerpo: cuerpoDelHeroeDeArena(u), equipo: u.equipo }
    : { nombre: u.name, cuerpo: cuerpoDeCombate(u), equipo: u.equipo };
}
// ------------------------------------------------------------- las piezas

/**
 * Una pieza en palabras, campo a campo como en su ficha: lo que el parte dice
 * que cambió de ella a media pelea («ataque 2 → 5»; `cambiosDeLaFicha`).
 */
export function piezaEnPalabras(p: Pieza): FichaEnPalabras {
  return {
    nombre: p.nombre,
    ataque: `${p.ataque}`,
    fuerza: `${p.fuerza ?? 0}`,
    defensa: `${p.defensa}`,
    armadura: `${p.armadura ?? 0}`,
    peso: `${p.peso}`,
    manos: aDosManos(p) ? '2' : '1',
    rueda: p.rueda === undefined ? 'nada' : ruedaDelArmaEnPalabras(p.rueda),
    precio: describirCoste(p.precio),
  };
}

/**
 * Si dos piezas son la misma, cifra a cifra (o extra a extra). Las dos en la forma
 * canónica (`validarPieza`, el fichero, la suma de una base): con dos formas
 * normalizadas basta comparar el texto.
 */
export function mismaPieza(a: PiezaEscrita, b: PiezaEscrita): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * La primera base de la cadena de `id` en `eq` (sin contarla a ella, de la más
 * cercana a la más lejana) cuya escrita cumple `cumple`, ya resuelta; `null` si
 * ninguna. La lee el parte de un retoque (qué base se tocó).
 */
export function primeraBaseQue(
  eq: CatalogoDeEquipo,
  id: string,
  cumple: (escrita: PiezaEscrita) => boolean,
): Pieza | null {
  const propia = eq.escritas.get(id);
  for (let e = propia; e !== undefined && esPiezaConBase(e); ) {
    const base = eq.escritas.get(e.base);
    if (base === undefined) return null;
    if (cumple(base)) return eq.pieza(base.id);
    e = base;
  }
  return null;
}

/**
 * `p` en el hueco `hueco`, con lo que el hueco exige y nada de lo que no admite
 * (`camposDelHueco`): solo un arma de cuerpo a cuerpo se lleva a dos manos, solo
 * ella y la lanza llevan rueda (y la llevan: si no la traía, la de la Espada,
 * `nivelesDeLaEspada`), y las cifras que el hueco no suma se quedan en 0 —un arma
 * que pasa a escudo deja su ataque y su fuerza—. El peso se queda: toda pieza
 * pesa. Una montura dice su fuerza y su agilidad (26-10-2026): la que trae, o la
 * fuerza del cuerpo común y la agilidad más baja de un cuerpo, lo mínimo que la
 * deja valer; ser de guerra va con ella. Lo demás se queda como estaba. Lo leen la
 * pieza nueva en blanco (`piezaNueva`) y el cambio de hueco de la ficha.
 */
export function enElHueco(p: Pieza, hueco: HuecoDePieza): Pieza {
  const {
    manos,
    rueda,
    fuerza,
    agilidad,
    armadura,
    lanza,
    guerra,
    tiro,
    recarga,
    cargas,
    ...resto
  } = p;
  const montura = hueco === 'montura';
  // Lo que tira va con la pieza a distancia; la agilidad de un arma de fuego, con su tiro.
  const aDistancia = hueco === 'distancia';
  const fuego = aDistancia && tiro === 'fuego';
  const campos = camposDelHueco(hueco);
  const admite = (c: CifraDePieza): boolean => campos.cifras.includes(c);
  return {
    ...resto,
    hueco,
    ataque: admite('ataque') ? p.ataque : 0,
    ...(montura
      ? {
          fuerza: fuerza !== undefined && fuerza >= 1 ? fuerza : CUERPO_COMUN.fuerza,
          agilidad: agilidad ?? AGILIDAD_DEL_CUERPO_MIN,
        }
      : admite('fuerza') && fuerza !== undefined
        ? { fuerza }
        : {}),
    defensa: admite('defensa') ? p.defensa : 0,
    ...(admite('armadura') && armadura !== undefined ? { armadura } : {}),
    ...(campos.conManos && manos !== undefined ? { manos } : {}),
    // Ser una lanza va con el arma de cuerpo a cuerpo, como las manos.
    ...(campos.conManos && lanza !== undefined ? { lanza } : {}),
    ...(montura && guerra !== undefined ? { guerra } : {}),
    ...(aDistancia && tiro !== undefined ? { tiro } : {}),
    ...(fuego ? { agilidad: agilidad ?? 1, recarga: recarga ?? 1 } : {}),
    ...(aDistancia && tiro === 'granada' ? { cargas: cargas ?? 1 } : {}),
    // Un arma de cuerpo a cuerpo dice su rueda: la que trae o, si no traía, la de
    // la Espada («todo a 3, como la Espada»).
    ...(campos.conRueda ? { rueda: rueda ?? nivelesDeLaEspada() } : {}),
  };
}

/**
 * Una pieza NUEVA: en blanco en un hueco —nada que sumar, con lo que el hueco
 * exige (`enElHueco`), y sin venderse ni caer como botín hasta que se diga; una a
 * distancia ya dispara por ir en su hueco— o como copia de otra («Duplicar»: tal
 * como está escrita, con su base si la tiene). Sobre otra («Nueva sobre esta»),
 * `piezaSobre`. Su id y su nombre, `idYNombreNuevos`.
 */
export function piezaNueva(desde: HuecoDePieza | Pieza, eq: CatalogoDeEquipo): PiezaEscrita {
  const { id, nombre } = idYNombreNuevos(desde, eq);
  if (typeof desde === 'string') {
    const enBlanco: Pieza = {
      id,
      nombre,
      hueco: desde,
      ataque: 0,
      defensa: 0,
      peso: 0,
      seConsigue: [],
      precio: 0,
    };
    return validarPieza(enElHueco(enBlanco, desde));
  }
  return validarPieza({ ...escritaDe(eq, desde.id), id, nombre });
}

/**
 * Una pieza NUEVA **sobre** `base` («Nueva sobre esta»): la base, la elegida, y
 * sin extras, así que suma lo mismo hasta que se le pongan; ni se vende ni cae como
 * botín hasta que se diga. Lo que no puede ser base lo dice `baseBlocker`. Su id y
 * su nombre, `idYNombreNuevos`.
 */
export function piezaSobre(base: Pieza, eq: CatalogoDeEquipo): PiezaEscrita {
  const nueva = { ...idYNombreNuevos(base, eq), base: base.id, seConsigue: [], extras: {} };
  const mal = baseBlocker(nueva, base.id, eq.escritas);
  if (mal !== null) throw new Error(mal);
  return validarPieza(nueva);
}

/**
 * El id y el nombre de una pieza nueva que parte de `desde`: `<raíz>-<n>` y
 * `<raíz> <n>` con el primer `n` ≥ 2 libre entre las piezas de `eq`; la raíz es el
 * hueco o la pieza de partida sin su `-<n>`. Ni el id ni el nombre de otra: dos
 * piezas con el mismo nombre no se distinguen en el desplegable de la unidad ni en
 * su tarjeta.
 */
function idYNombreNuevos(
  desde: Hueco | Pieza,
  eq: CatalogoDeEquipo,
): { readonly id: string; readonly nombre: string } {
  const raizDelId = typeof desde === 'string' ? desde : desde.id.replace(/-\d+$/, '');
  const raiz =
    typeof desde === 'string' ? NOMBRE_DE_HUECO[desde] : desde.nombre.replace(/ \d+$/, '');
  const nombres = new Set([...eq.piezas.values()].map((p) => nombreComparable(p.nombre)));
  let n = 2;
  while (eq.piezas.has(`${raizDelId}-${n}`) || nombres.has(nombreComparable(`${raiz} ${n}`))) {
    n++;
  }
  return { id: `${raizDelId}-${n}`, nombre: `${raiz} ${n}` };
}

/**
 * La pieza `escrita` sobre la base `base` (el id de otra pieza del mismo hueco), o
 * entera con `null`, **con las mismas cifras finales**: sus extras pasan a ser lo
 * que le falta a la base para llegar a lo que suma ahora (`diferenciaDe`). Cambiar
 * de base y volver deja la pieza como estaba. Las manos son las de la base; de
 * dónde se consigue, el suyo. Lanza con lo que diga `baseBlocker` (con su hueco:
 * cambiar de base no cambia de hueco). Lo pide el desplegable «Base» de su ficha.
 */
export function conBase(
  escrita: PiezaEscrita,
  base: string | null,
  eq: CatalogoDeEquipo,
): PiezaEscrita {
  const final = eq.pieza(escrita.id);
  if (base === null) return validarPieza({ ...final, nombre: escrita.nombre });
  const mal = baseBlocker(escrita, base, eq.escritas, final.hueco);
  if (mal !== null) throw new Error(mal);
  return validarPieza({
    id: escrita.id,
    nombre: escrita.nombre,
    base,
    seConsigue: escrita.seConsigue,
    extras: diferenciaDe(final, eq.pieza(base)),
  });
}

/**
 * Cómo está escrita la pieza `id` de `eq`: entera o sobre su base. Lanza si no
 * está. La leen la ficha, lo que se duplica y lo que se cambia.
 */
export function escritaDe(eq: CatalogoDeEquipo, id: string): PiezaEscrita {
  const e = eq.escritas.get(id);
  if (e === undefined) throw new Error(`no hay ninguna pieza «${id}»`);
  return e;
}

/** La base de la pieza `id` de `eq`, resuelta, o `null` si está entera. */
export function baseDe(eq: CatalogoDeEquipo, id: string): Pieza | null {
  const e = escritaDe(eq, id);
  return esPiezaConBase(e) ? eq.pieza(e.base) : null;
}

/**
 * De qué sale la pieza `id`: su cadena de bases resueltas, de la raíz a ella
 * («Espada → Espada de herrería → Espada bendita»), o solo ella si está entera
 * (`baseDe`, en cadena). Lo enseña su ficha.
 */
export function cadenaDeBases(eq: CatalogoDeEquipo, id: string): readonly Pieza[] {
  const cadena: Pieza[] = [eq.pieza(id)];
  for (let b = baseDe(eq, id); b !== null; b = baseDe(eq, b.id)) cadena.unshift(b);
  return cadena;
}

/**
 * Las piezas que `id` puede tomar de base (`baseBlocker`, con su hueco): las de su
 * hueco, sin ella ni las que están sobre ella. Las ofrece el desplegable «Base» de
 * su ficha; `conBase` dice por qué no a las demás.
 */
export function basesPosibles(eq: CatalogoDeEquipo, id: string): readonly Pieza[] {
  const p = eq.pieza(id);
  const escrita = escritaDe(eq, id);
  return [...eq.piezas.values()].filter(
    (b) => baseBlocker(escrita, b.id, eq.escritas, p.hueco) === null,
  );
}

/**
 * Las piezas `base` (un catálogo entero, escrito) con las de `encima` puestas, una
 * a una: cada una sustituye a la de su id o se añade al final. **La única
 * superposición de piezas por id**: la usan la página de la arena al cambiar una
 * pieza y al abrir un enlace (que entra en su catálogo como cambios sin guardar) y
 * la lectura de un enlace (`montajeDeLaURL`).
 */
export function conPiezas(
  base: readonly PiezaEscrita[],
  encima: readonly PiezaEscrita[],
): readonly PiezaEscrita[] {
  const todas = [...base];
  for (const p of encima) {
    const nueva = validarPieza(p);
    const i = todas.findIndex((x) => x.id === nueva.id);
    if (i < 0) todas.push(nueva);
    else todas[i] = nueva;
  }
  return todas;
}

/**
 * Por qué `cuerpo` ya no puede llevar `equipo` con las piezas de `eq` (la regla
 * del equipo de una unidad, `equipoDeUnidadBlocker`), dicho con quién la lleva, o
 * `null`. Lo leen el cambio de una pieza en el catálogo (`cambioDePiezas`) y
 * a media pelea (`retocarEnBatalla`, `kind: 'piezas'`).
 */
export function equipoQueNoVale(cuerpo: UnitInfo, equipo: Equipo, eq: EquipoAtado): string | null {
  const motivo = equipoDeUnidadBlocker(cuerpo, equipo, eq);
  return motivo === null ? null : `la lleva «${cuerpo.name}»: ${motivo}`;
}

/** Lo que se le puede poner a una unidad en un hueco (`opcionesDelHueco`). */
export interface OpcionDelHueco {
  readonly pieza: Pieza;
  /** Por qué no se le puede poner, o `null` si se puede. */
  readonly motivo: string | null;
}

/**
 * Las piezas del hueco `hueco` que no lleva `u`, en el orden de `eq`, cada una con
 * lo que diría el núcleo al ponérsela (`equipoDeUnidadBlocker`: un escudo con un arma a
 * dos manos, una que el índice no sabe medir): `null` si entra. **La pregunta
 * «¿qué le pongo?»**: la lee la ficha de la unidad, que no ofrece lo que el núcleo
 * rechazaría.
 *
 * Las manos se preguntan antes, desde la pieza que se pone (`manosBlocker` con su
 * hueco): el equipo entero ya puesto las miraba desde lo que estaba, y el remedio
 * salía al revés («quita antes Espada» con la Espada que se quería poner de segunda
 * junto a un mandoble; H2 del QA de fuerza y agilidad, 26-10-2026).
 */
export function opcionesDelHueco(
  quien: Unidad | HeroeDeArena,
  hueco: Hueco,
  eq: EquipoAtado,
): readonly OpcionDelHueco[] {
  const u = portadorDe(quien);
  return [...eq.piezas.values()]
    .filter((p) => huecosDeLaPieza(p.hueco).includes(hueco) && p.id !== u.equipo[hueco])
    .map((p) => ({
      pieza: p,
      motivo:
        eq.manosBlocker(u.equipo, p.id, hueco) ??
        equipoDeUnidadBlocker(u.cuerpo, { ...u.equipo, [hueco]: p.id }, eq),
    }));
}

/**
 * Por qué no se le puede quitar a `u` lo que lleva en `hueco`, o `null` si se
 * puede: que lleve algo (`nadaEnElHueco`) y que sin ello siga valiendo
 * (`equipoDeUnidadBlocker`: sin arma de cuerpo a cuerpo no se combate). La lee la
 * ficha, que no ofrece la × que el núcleo rechazaría.
 */
export function quitarBlocker(
  quien: Unidad | HeroeDeArena,
  hueco: Hueco,
  eq: EquipoAtado,
): string | null {
  const u = portadorDe(quien);
  if (u.equipo[hueco] === undefined) return nadaEnElHueco(u.nombre, hueco);
  const { [hueco]: _quitada, ...sin } = u.equipo;
  return equipoDeUnidadBlocker(u.cuerpo, sin, eq);
}

/**
 * El catálogo de equipo que queda al pasar de `antes` a las piezas `despues` (un
 * catálogo entero, escrito), hecho una vez (`catalogoDeEquipo`), o por qué no se
 * puede: que no se borre la base de otra (`baseQueSeBorra`, antes de leerlo, que si
 * no lo diría «no existe»), que cada pieza valga resuelta, que dos piezas no se
 * llamen igual (`nombreRepetido`), que nadie del catálogo de unidades `unidades`
 * lleve una pieza que desaparece —diciendo quién— o que cambia y deja de valerle
 * (`equipoQueNoVale`: un arma que pasa a dos manos con un escudo puesto, la Espada
 * bendita que cambia porque cambió la Espada) y, como cierre, lo que la carga del
 * juego exige a los dos catálogos juntos (`leerCatalogos`: el equipo base del
 * héroe, sin el que el juego no cargaría). La leen la vista «Editar equipo» al
 * cambiar una pieza y al abrir un enlace, que entra igual. En plena pelea se
 * pregunta además a la batalla (`retocarEnBatalla`), con el catálogo que da esto.
 */
export function cambioDePiezas(
  antes: CatalogoDeEquipo,
  despues: readonly PiezaEscrita[],
  unidades: readonly Unidad[],
  heroes: readonly HeroeDeArena[] = [],
): { readonly equipo: CatalogoDeEquipo } | { readonly motivo: string } {
  const borrada = baseQueSeBorra(antes, despues);
  if (borrada !== null) return { motivo: borrada };
  const leido = oElMotivo(() => catalogoDeEquipo(despues));
  if ('motivo' in leido) return leido;
  const equipo = leido.valor;
  const motivo =
    nombreRepetido(antes, equipo) ??
    quienDejaDeValer(antes, equipo, [...unidades, ...heroes].map(portadorDe));
  if (motivo !== null) return { motivo };
  const carga = oElMotivo(() => leerCatalogos(equipo, { unidades }));
  return 'motivo' in carga ? carga : { equipo };
}

/**
 * La primera unidad de `unidades` que lleva una pieza que de `antes` a `despues`
 * desaparece (diciendo quién) o cambia y deja de valerle (`equipoQueNoVale`), o
 * `null`. Lo que no cambia, por identidad o por contenido (`mismaPieza`), no se mira.
 */
function quienDejaDeValer(
  antes: CatalogoDeEquipo,
  despues: CatalogoDeEquipo,
  portadores: readonly Portador[],
): string | null {
  for (const u of portadores) {
    for (const id of idsPuestos(u.equipo)) {
      const a = antes.piezaSiExiste(id);
      const d = despues.piezaSiExiste(id);
      if (a === d || (a !== null && d !== null && mismaPieza(a, d))) continue;
      if (d === null) {
        return `la lleva «${u.nombre}»: quítasela antes de borrar ${a === null ? `«${id}»` : `«${a.nombre}»`}`;
      }
      const motivo = equipoQueNoVale(u.cuerpo, u.equipo, despues);
      if (motivo !== null) return motivo;
    }
  }
  return null;
}

/**
 * Por qué de `antes` a `despues` se borra la base de otra pieza que sigue
 * (18-10-2026: «Espada es la base de «Espada de herrería»»), o `null`.
 */
function baseQueSeBorra(antes: CatalogoDeEquipo, despues: readonly PiezaEscrita[]): string | null {
  const quedan = new Set(despues.map((p) => p.id));
  // De cada base, la primera que está sobre ella.
  const sobre = new Map<string, PiezaEscrita>();
  for (const x of despues) {
    if (esPiezaConBase(x) && !sobre.has(x.base)) sobre.set(x.base, x);
  }
  for (const p of antes.escritas.values()) {
    const sobreElla = quedan.has(p.id) ? undefined : sobre.get(p.id);
    if (sobreElla !== undefined) {
      return `«${p.nombre}» es la base de «${sobreElla.nombre}»: cámbiale la base o bórrala antes`;
    }
  }
  return null;
}

/** Un nombre de pieza como se distingue a la vista: sin mayúsculas ni espacios de más. */
function nombreComparable(nombre: string): string {
  return nombre.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Por qué `nuevo` tiene una pieza que se llama como otra, o `null`: solo mira las
 * que cambian o aparecen de `viejo` a `nuevo`. Un catálogo escrito a mano con dos
 * nombres iguales se sigue leyendo; lo que no se puede es hacer otra.
 */
function nombreRepetido(viejo: EquipoAtado, nuevo: EquipoAtado): string | null {
  for (const p of nuevo.piezas.values()) {
    const antes = viejo.piezaSiExiste(p.id);
    if (antes === p || (antes !== null && mismaPieza(antes, p))) continue;
    const otra = [...nuevo.piezas.values()].find(
      (x) => x.id !== p.id && nombreComparable(x.nombre) === nombreComparable(p.nombre),
    );
    if (otra !== undefined) {
      return `ya hay una pieza que se llama «${otra.nombre}» (${NOMBRE_DE_HUECO[otra.hueco]}): ponle otro nombre, que en la ficha de una unidad no se distinguirían`;
    }
  }
  return null;
}

/**
 * Los ids de las piezas que lleva lo montado: las de sus unidades y las de sus
 * héroes (`deLosHeroes`, el equipo de cada uno). Lo leen el enlace (qué piezas
 * viajan) y la página al abrirlo.
 */
export function idsLlevados(
  unidades: readonly Unidad[],
  deLosHeroes: readonly Equipo[],
): ReadonlySet<string> {
  return new Set([
    ...unidades.flatMap((u) => idsPuestos(u.equipo)),
    ...deLosHeroes.flatMap(idsPuestos),
  ]);
}

/**
 * Las piezas, escritas, que lleva lo montado: las puestas en alguna unidad o en
 * algún héroe (`idsLlevados`), **con sus bases** en cadena (la Espada
 * bendita lleva la Espada de herrería y la Espada), tal como están en `piezas`, en
 * su orden. Es lo que va en el enlace de la pelea, todas, para que se abra igual
 * en otra máquina aunque su catálogo sea otro. Lanza si lo montado lleva una que
 * no está en `piezas`.
 */
export function piezasDelMontaje(
  unidades: readonly Unidad[],
  deLosHeroes: readonly Equipo[],
  piezas: readonly PiezaEscrita[],
): readonly PiezaEscrita[] {
  const escritas = new Map(piezas.map((p) => [p.id, p]));
  const llevadas = new Set<string>();
  const poner = (id: string): void => {
    if (llevadas.has(id)) return;
    const e = escritas.get(id);
    if (e === undefined) throw new Error(`lo montado lleva la pieza «${id}» y no está`);
    llevadas.add(id);
    if (esPiezaConBase(e)) poner(e.base);
  };
  for (const id of idsLlevados(unidades, deLosHeroes)) poner(id);
  return piezas.filter((p) => llevadas.has(p.id));
}

/** Lo que da `f`, o el mensaje con el que lanza. */
export function oElMotivo<T>(f: () => T): { readonly valor: T } | { readonly motivo: string } {
  try {
    return { valor: f() };
  } catch (err) {
    return { motivo: err instanceof Error ? err.message : String(err) };
  }
}
