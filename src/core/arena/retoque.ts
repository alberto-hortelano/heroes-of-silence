/**
 * Retocar a media pelea (`retocarEnBatalla`): un tipo, el héroe o las piezas, con lo
 * gastado conservado y el parte de lo que cambió.
 *
 * Era parte de `core/arena.ts`, repartido en `arena/` en la fase N de la
 * reorganización (07-11-2026); lo que hace la arena y por qué, en `montaje.ts`.
 */
import { loADistanciaTrasElRetoque } from '../battle/a-distancia.js';
import { levantablesDe, libroConElCatalogo } from '../battle/montaje.js';
import type {
  BattleStack,
  BattleState,
  FichaEnPalabras,
  HeroeDelBando,
  OrigenDelStack,
} from '../battle/types.js';
import type { CatalogoDeEquipo } from '../equipo/atado.js';
import { esPiezaConBase } from '../equipo/pieza.js';
import { idsPuestos, mismasCifras } from '../equipo/vestir.js';
import { cifrasDelIndividuo } from '../hero/experiencia.js';
import { maxMana } from '../hero/hero.js';
import { type CatalogoDeHechizos, HECHIZOS_DEL_JUEGO } from '../magia/catalogo.js';
import type { Equipo, UnitInfo } from '../types.js';
import { cuerpoDe } from '../unidad/catalogo.js';
import { validarUnidad } from '../unidad/formato.js';
import {
  cambiosDeLaFicha,
  claveDeFicha,
  fichaDelHeroe,
  fichaEnPalabras,
  huecosEnPalabras,
  tipoDeLaFuente,
  tipoDelStack,
} from './ficha.js';
import { type HeroeDeArena, heroeDeArena } from './heroe.js';
import { type FuenteDeArena, LADOS, type Lado, ladoDe } from './lados.js';
import { type CatalogoDeLaArena, catalogoDeLaPelea, unidadDeLaFuente } from './montaje.js';
import {
  equipoQueNoVale,
  escritaDe,
  mismaPieza,
  oElMotivo,
  piezaEnPalabras,
  primeraBaseQue,
} from './piezas.js';

// ------------------------------------------------------------- retocar en la pelea

/**
 * Un cambio de cifras a media pelea (decisión del usuario, 11-10-2026: «que
 * pueda modificar los personajes durante el combate»): las de un TIPO —una unidad
 * del catálogo, como en la ficha del montaje— o las del héroe de un lado.
 */
export type RetoqueDeArena =
  | { readonly kind: 'tipo'; readonly fuente: FuenteDeArena }
  | { readonly kind: 'heroe'; readonly lado: Lado; readonly datos: HeroeDeArena }
  /**
   * El catálogo de equipo entero, hecho, como queda tras el cambio. Cambiar una
   * pieza, crearla y borrarla son lo mismo: otro catálogo. «Editar equipo» también
   * vale a media pelea.
   */
  | { readonly kind: 'piezas'; readonly equipo: CatalogoDeEquipo }
  /**
   * Los hechizos enteros, como quedan tras el cambio (el editor de magia): el libro
   * de la batalla pasa a ellos. Lo ya colgado no cambia (lleva sus números).
   */
  | { readonly kind: 'hechizos'; readonly hechizos: CatalogoDeHechizos };

/**
 * Aplica el retoque a la batalla en curso y devuelve `null`, o devuelve por qué
 * no entra sin haber tocado nada. La ÚNICA redacción: la sesión de la arena la
 * enseña en el editor y, si no entra, no cambia su catálogo.
 *
 * Un tipo cambia en TODOS sus stacks, vivos o muertos y de los dos bandos —es lo
 * que hace la ficha del montaje con la pelea siguiente—, y nunca el héroe aunque
 * su figura sea la misma hoja. Cada stack se sustituye entero en `state.stacks`
 * con las cifras nuevas, sin tocar nunca el objeto de `unit`, que puede ser el del
 * catálogo. **Lo gastado sigue gastado**: la herida y el maná que ya se fueron se restan de las cifras nuevas (`topHp = máx(1, PV nuevos −
 * herida)`): subir la vida no cura, y bajarla no mata. La moral no se recalcula y
 * la velocidad nueva cuenta en la cola desde la ronda siguiente, como la Prisa a
 * media ronda. Lo que no se cambia a media pelea es la figura del héroe: eso, en
 * el montaje (toda unidad de la arena ocupa una casilla, 13-10-2026). Lo que entra deja un `retoque` en el
 * registro.
 *
 * Una pieza (`kind: 'piezas'`) cambia a la vez todos los stacks que la llevan, de
 * los dos bandos y el héroe incluido, con la misma cuenta de lo gastado
 * (`retocarLasPiezas`). Las cifras de los tipos y del héroe se leen con
 * `catalogo`, el de la pelea con que juega quien llama (la sesión de la arena,
 * `catalogoDelMontaje` con lo retocado): la batalla no lleva catálogo.
 */
export function retocarEnBatalla(
  state: BattleState,
  r: RetoqueDeArena,
  catalogo: CatalogoDeLaArena,
): string | null {
  const motivo = retocar(state, r, catalogo);
  // Lo que se levanta de un cadáver, con las cifras de después: si no, un zombi
  // retocado a media pelea se levantaría con las de antes (riesgo del plan de
  // «Levantar zombi», 08-11-2026).
  if (motivo === null) {
    state.levantables = levantablesDe(state.libro, catalogoTrasElRetoque(r, catalogo));
  }
  return motivo;
}

/**
 * El catálogo de la pelea tras un retoque que entra: **el único sitio que lo dice**.
 * Con él rehace la batalla lo que se levanta y la sesión de la arena lo adopta
 * (`SesionDeArena.retocar`); hasta /simplify (09-11-2026) la sesión llevaba su copia
 * del `switch`, y ya divergía (un tipo sin validar; los hechizos, solo en ella).
 */
export function catalogoTrasElRetoque(
  r: RetoqueDeArena,
  catalogo: CatalogoDeLaArena,
): CatalogoDeLaArena {
  const { unidades, equipo, hechizos } = catalogo;
  switch (r.kind) {
    case 'tipo': {
      const u = validarUnidad(r.fuente.unidad, equipo);
      return catalogoDeLaPelea([...new Map(unidades).set(u.id, u).values()], equipo, hechizos);
    }
    case 'piezas':
      return catalogoDeLaPelea([...unidades.values()], r.equipo, hechizos);
    case 'hechizos':
      return catalogoDeLaPelea([...unidades.values()], equipo, r.hechizos);
    case 'heroe':
      return catalogo;
  }
}

function retocar(
  state: BattleState,
  r: RetoqueDeArena,
  catalogo: CatalogoDeLaArena,
): string | null {
  const eq = catalogo.equipo;
  if (state.finished !== null) {
    return 'la batalla ya ha terminado; el cambio vale para la pelea siguiente';
  }
  // Las cifras nuevas salen de la misma validación que el montaje: lo que no
  // valida es el motivo.
  switch (r.kind) {
    case 'tipo': {
      const nuevo = oElMotivo(() => ({
        unit: unidadDeLaFuente(r.fuente, eq),
        ficha: fichaEnPalabras(r.fuente, eq),
      }));
      return 'motivo' in nuevo
        ? nuevo.motivo
        : retocarElTipo(state, r.fuente, nuevo.valor.unit, nuevo.valor.ficha);
    }
    case 'heroe': {
      const nuevo = oElMotivo(() => ({
        heroe: heroeDeArena(r.datos, eq),
        ficha: fichaDelHeroe(r.datos, eq),
      }));
      if ('motivo' in nuevo) return nuevo.motivo;
      // Los hechizos de su libro, que estén en el catálogo de la pelea.
      const falta = r.datos.hechizos.find(
        (id) => !(catalogo.hechizos ?? HECHIZOS_DEL_JUEGO).has(id),
      );
      if (falta !== undefined) return `no hay ningún hechizo «${falta}»`;
      const motivo = retocarElHeroe(state, r.lado, nuevo.valor.heroe, nuevo.valor.ficha);
      if (motivo === null)
        state.libro = libroConElCatalogo(state, catalogo.hechizos ?? HECHIZOS_DEL_JUEGO);
      return motivo;
    }
    case 'piezas':
      return retocarLasPiezas(state, catalogo, r.equipo);
    case 'hechizos': {
      const usados = libroConElCatalogo(state, null);
      const borrado = Object.keys(usados).find((id) => !r.hechizos.has(id));
      if (borrado !== undefined) {
        return `«${state.libro[borrado]?.nombre ?? borrado}» lo lleva alguien de la pelea: no se quita a media pelea`;
      }
      const antes = state.libro;
      state.libro = libroConElCatalogo(state, r.hechizos);
      const cambian = Object.keys(state.libro).filter(
        (id) => JSON.stringify(state.libro[id]) !== JSON.stringify(antes[id]),
      );
      if (cambian.length > 0) {
        state.log.push({
          kind: 'retoque',
          nombre: 'la magia',
          stacks: [],
          cambios: cambian.map((id) => `hechizo: ${state.libro[id]?.nombre ?? id}`),
        });
      }
      return null;
    }
  }
}

/**
 * La ficha de antes de `clave`, que puso el montaje. Sin ella la batalla no la
 * montó `batallaDeArena`: el parte no sabría qué cambió, y se dice.
 */
function fichaDeAntes(state: BattleState, clave: string): FichaEnPalabras {
  const ficha = state.fichasDeArena?.[clave];
  if (ficha === undefined) {
    throw new Error(`la pelea no trae la ficha de ${clave}: no la montó la arena`);
  }
  return ficha;
}

function retocarElTipo(
  state: BattleState,
  fuente: FuenteDeArena,
  unit: UnitInfo,
  ficha: FichaEnPalabras,
): string | null {
  const tipo = tipoDeLaFuente(fuente);
  const suyos = stacksDeLaFicha(state, claveDeFicha(tipo));
  if (suyos.length === 0) return `${unit.name} no está en esta pelea`;
  const clave = claveDeFicha(tipo);
  const cambios = cambiosDeLaFicha(fichaDeAntes(state, clave), ficha);
  // La ficha manda: si no cambia, tampoco cambia ninguna cifra de la pelea, y
  // no se escribe nada (N1 de QA: «ataque 3 → 3» dejaba una línea y «Cambiado»).
  if (cambios.length === 0) return null;
  aplicarAlTipo(state, suyos, unit);
  (state.fichasDeArena as Record<string, FichaEnPalabras>)[clave] = ficha;
  state.log.push({ kind: 'retoque', nombre: unit.name, stacks: suyos.map((s) => s.id), cambios });
  return null;
}

/**
 * Los stacks de una ficha (`claveDeFicha`): los de un tipo, vivos o muertos y de
 * los dos bandos, o el cuerpo del héroe de un lado.
 */
function stacksDeLaFicha(state: BattleState, clave: string): BattleStack[] {
  return state.stacks.filter((s) => claveDeFicha(tipoDelStack(s)) === clave);
}

/**
 * Pone las cifras `unit` a cada stack de `suyos`, con lo gastado restado
 * (`conCifrasNuevas`) y la veteranía de cada uno encima. **El único bucle** de un
 * retoque: lo usan cambiar un tipo y cambiar una pieza, y por eso un mismo cambio
 * deja la misma herida por los dos caminos.
 */
function aplicarAlTipo(state: BattleState, suyos: readonly BattleStack[], unit: UnitInfo): void {
  for (const s of suyos) {
    const veterania = s.origen.kind === 'heroe' ? null : s.origen.veterania;
    conCifrasNuevas(state, s, cifrasDelIndividuo(unit, veterania));
  }
}

/**
 * Cambia las piezas de la pelea de `antes` a `despues` (catálogos enteros, `kind: 'piezas'`),
 * en dos tiempos y sin tocar nada si no entra: primero cada stack que lleva algo
 * se vuelve a sumar con las piezas nuevas —su cuerpo (`cuerpoDe`, con el catálogo
 * de la pelea), más lo que lleva, `UnitInfo.equipo`—, con la regla de
 * siempre (`equipoQueNoVale`); el primero que no vale es el motivo. Después, a
 * los que cambian de cifras, las nuevas con la misma cuenta de lo gastado que
 * cambiar el tipo a mano (`conCifrasNuevas`).
 *
 * El parte lleva un `retoque` por pieza que cambia las cifras de alguien, con
 * todos los stacks que la llevan y lo que cambió de ella («ataque 2 → 5»). Las
 * fichas se ponen al día (el nombre de la pieza) sin escribir su diferencia: lo
 * que cambió es la pieza, no la unidad.
 */
function retocarLasPiezas(
  state: BattleState,
  catalogo: CatalogoDeLaArena,
  despues: CatalogoDeEquipo,
): string | null {
  const antes = catalogo.equipo;
  const cambian: {
    readonly s: BattleStack;
    readonly unit: UnitInfo;
    readonly lleva: Equipo;
  }[] = [];
  for (const s of state.stacks) {
    const cuerpo = cuerpoDe(s, catalogo);
    const lleva = s.unit.equipo;
    if (lleva === undefined) continue;
    const motivo = equipoQueNoVale(cuerpo, lleva, despues);
    if (motivo !== null) return motivo;
    const unit = despues.conEquipo(cuerpo, lleva);
    if (!mismasCifras(s.unit, unit)) cambian.push({ s, unit, lleva });
  }
  for (const { s, unit } of cambian) conCifrasNuevas(state, s, unit);
  // Un retoque por pieza que cambia a alguien, con quien la lleva.
  for (const id of new Set([...antes.piezas.keys(), ...despues.piezas.keys()])) {
    const a = antes.piezaSiExiste(id);
    const d = despues.piezaSiExiste(id);
    if (a === null || d === null || a === d || mismaPieza(a, d)) continue;
    const suyos = cambian.filter((c) => idsPuestos(c.lleva).includes(id));
    if (suyos.length === 0) continue;
    const cambios = cambiosDeLaFicha(piezaEnPalabras(a), piezaEnPalabras(d));
    // La que sigue escrita igual cambió por su base (el vínculo es vivo), y se
    // dice cuál.
    const escritaAntes = antes.escritas.get(id);
    const escrita = escritaDe(despues, id);
    if (
      escritaAntes !== undefined &&
      esPiezaConBase(escrita) &&
      mismaPieza(escrita, escritaAntes)
    ) {
      // La base que se tocó, no la de al lado (QA 3 del 18-10-2026): cambiar la
      // Espada se dice «por su base, «Espada»» también en la bendita.
      const tocada =
        primeraBaseQue(despues, id, (e) => {
          const a = antes.escritas.get(e.id);
          return a === undefined || !mismaPieza(a, e);
        }) ?? despues.pieza(escrita.base);
      cambios.push(`por su base, «${tocada.nombre}»`);
    }
    state.log.push({
      kind: 'retoque',
      nombre: d.nombre,
      stacks: suyos.map((c) => c.s.id),
      cambios,
    });
  }
  // Las fichas de las unidades nombran sus piezas: renombrada una, al día.
  const fichas = state.fichasDeArena as Record<string, FichaEnPalabras> | undefined;
  for (const s of state.stacks) {
    const lleva = s.unit.equipo;
    if (fichas === undefined || lleva === undefined) continue;
    const clave = claveDeFicha(
      s.origen.kind === 'heroe' ? { kind: 'heroe', lado: ladoDe(s.side) } : tipoDelStack(s),
    );
    const ficha = fichas[clave];
    if (ficha !== undefined) fichas[clave] = { ...ficha, ...huecosEnPalabras(lleva, despues) };
  }
  return null;
}

function retocarElHeroe(
  state: BattleState,
  lado: Lado,
  nuevo: HeroeDelBando,
  ficha: FichaEnPalabras,
): string | null {
  const bando = LADOS[lado].bando;
  const antes = state.heroes[bando];
  const cuerpo = state.stacks.find((s) => s.side === bando && s.origen.kind === 'heroe');
  if (antes === null || cuerpo === undefined) {
    return `el bando ${LADOS[lado].adjetivo} no lleva héroe en esta pelea`;
  }
  if (nuevo.figura !== cuerpo.body) {
    return 'la figura del héroe no se cambia a media pelea: eso, en el montaje';
  }
  const clave = claveDeFicha({ kind: 'heroe', lado });
  const cambios = cambiosDeLaFicha(fichaDeAntes(state, clave), ficha);
  if (cambios.length === 0) return null;
  conCifrasNuevas(state, cuerpo, nuevo.cuerpo, { kind: 'heroe', desnudo: nuevo.desnudo });
  // El maná, como la herida: lo que el Conocimiento nuevo no deja restar se debe.
  const gastado = maxMana(antes) - antes.mana + (antes.manaGastadoDeMas ?? 0);
  const mana = Math.max(0, nuevo.mando.mana - gastado);
  const deMas = gastado - (nuevo.mando.mana - mana);
  state.heroes[bando] = {
    ...nuevo.mando,
    mana,
    castThisRound: antes.castThisRound,
    ...(deMas === 0 ? {} : { manaGastadoDeMas: deMas }),
  };
  (state.fichasDeArena as Record<string, FichaEnPalabras>)[clave] = ficha;
  state.log.push({ kind: 'retoque', nombre: nuevo.mando.name, stacks: [cuerpo.id], cambios });
  return null;
}

/**
 * Sustituye `s` en la batalla por el mismo stack con las cifras `unit`, con lo
 * gastado restado (`retocarEnBatalla`). Un stack nuevo, no el viejo retocado:
 * `unit` es de solo lectura, y nadie guarda un stack de una jugada a otra (se
 * buscan por id).
 *
 * Lo gastado es lo que se ve (`hp − topHp`) más lo que se debía de un retoque
 * anterior (`gastadoDeMas`); lo que las cifras nuevas no dejan restar —la vida no
 * baja de 1— se vuelve a deber. Calculado solo desde las cifras de ese momento,
 * bajar la vida por debajo de la herida y volver a subirla curaba (N3 de QA). Curar
 * mientras se debe cura la herida de verdad: lo curado sube `topHp` y la deuda se
 * queda. Sin munición: en la arena no se cuentan tiros (13-10-2026).
 */
function conCifrasNuevas(
  state: BattleState,
  s: BattleStack,
  unit: UnitInfo,
  origen: OrigenDelStack = s.origen,
): void {
  const i = state.stacks.indexOf(s);
  if (i < 0) throw new Error(`${s.id} no está en esta batalla`);
  const { gastadoDeMas: debe, ...resto } = s;
  // Con otra clase de tiro, lo pendiente a distancia no vale (`loADistanciaTrasElRetoque`).
  const aDistancia = loADistanciaTrasElRetoque(s, unit);
  if (s.count === 0) {
    state.stacks[i] = { ...s, ...aDistancia, unit, origen };
    return;
  }
  const herida = s.unit.hp - s.topHp + (debe ?? 0);
  const topHp = Math.max(1, unit.hp - herida);
  const deMas = herida - (unit.hp - topHp);
  state.stacks[i] = {
    ...resto,
    ...aDistancia,
    unit,
    origen,
    topHp,
    ...(deMas === 0 ? {} : { gastadoDeMas: deMas }),
  };
}
