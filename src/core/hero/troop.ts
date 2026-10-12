/**
 * La tropa de individuos: qué es cada uno, cuánto ocupa y cuánto cabe.
 *
 * Desde la fase 1a un ejército es una lista de individuos (`Troop`), uno por
 * hex en el tablero, y lo que limita cuántos lleva un héroe no son los cinco
 * huecos de HoMM2 sino su **liderazgo**: cada individuo ocupa lo que diga su
 * fila de `data/creatures.json`, y el héroe tiene un tope que crece con el
 * nivel (`data/liderazgo.json`). Las dos cifras son provisionales y viven en
 * datos: la economía la define el usuario.
 *
 * Este módulo es la ÚNICA puerta para tres preguntas que antes se contestaban
 * cada una en su sitio, y que con un personaje en el ejército dejaban de
 * tener respuesta: de dónde salen las cifras de un individuo (`troopUnit`),
 * cuánto ocupa (`troopLeadership`) y cómo se ve agrupado (`troopSummary`).
 * Mientras cada lector llamaba a `creature(stack.creature)` por su cuenta, un
 * héroe con un personaje no podía ni pasar de día: `maxMovePoints` lanzaba
 * «criatura desconocida: "character"» en el `advanceDay`.
 */
import { creature, type GrupoDeTropa, LIDERAZGO } from '../data.js';
import type { Character } from '../rpg/character.js';
import { combatProfile } from '../rpg/stats.js';
import type { Army, Stack, Troop, UnitInfo, Veterania } from '../types.js';
import { piezasPuestas } from './equipo.js';
import {
  cifrasDeCatalogo,
  cifrasDelIndividuo,
  RANGO_MAXIMO_DE_TROPA,
  rangoDeHeroe,
  rangoDeTropa,
  siguienteUmbral,
  subidasDeRango,
} from './experiencia.js';

/** Los personajes de la partida, si los hay: `GameState.characters`. */
export type Personajes = Readonly<Record<string, Character>> | undefined;

/**
 * La puerta para buscar un personaje por id. Lanza diciendo el id si la partida
 * no lo conoce: sería un individuo sin cifras, y adivinárselas es justo lo que
 * no se hace. `quien` dice desde dónde se le buscaba —«Gustav lleva en el
 * ejército», «la batalla devuelve»—, para que la frase lo cuente.
 */
export function characterOf(characters: Personajes, id: string, quien: string): Character {
  const c = characters?.[id];
  if (c === undefined) {
    throw new Error(`${quien} al personaje "${id}", pero la partida no lo conoce`);
  }
  return c;
}

/**
 * Las cifras de un individuo: del catálogo, o del perfil de su personaje.
 *
 * Es lo que leen la velocidad del héroe, la fuerza que calcula la IA y las
 * vistas del ejército. El motor de batalla tiene su propia resolución
 * (`resolveUnit`), que además trae los PV con los que entra un herido.
 */
export function troopUnit(t: Troop, characters: Personajes): UnitInfo {
  // La veteranía se suma aquí y en `resolveUnit` con las MISMAS funciones: un
  // test exige que las dos puertas den lo mismo para un veterano.
  if (t.member === undefined) return cifrasDeCatalogo(t.creature, t.veterania);
  const perfil = combatProfile(characterOf(characters, t.member, 'el ejército lleva'));
  return cifrasDelIndividuo(perfil.unit, t.veterania);
}

/** Lo que ocupa un individuo en el liderazgo. */
function troopLeadership(t: Troop): number {
  return t.member === undefined ? creature(t.creature).leadership : LIDERAZGO.personaje;
}

/** Lo que ocupa el ejército entero. */
export function armyLeadership(army: Army): number {
  let total = 0;
  for (const t of army) total += troopLeadership(t);
  return total;
}

/**
 * El tope de liderazgo de un héroe. **Derivado del rango, no guardado**: un
 * campo `leadership` en `Hero` sería un segundo dato que subir al subir de
 * rango, y el día que alguien se olvidara de una de las dos escrituras el tope
 * mentiría. Provisional, como todas las cifras de `data/liderazgo.json`.
 *
 * `base` es el de un héroe recién hecho, que está en el rango 5 de la escala
 * única (`subidasDeRango`): no el de un héroe de rango 1, que no existe.
 */
export function heroLeadership(hero: { readonly experience: number }): number {
  const { base, porRango, max } = LIDERAZGO.heroe;
  return Math.min(max, base + porRango * subidasDeRango(rangoDeHeroe(hero)));
}

/**
 * El tope de la tropa que guarda un castillo sin héroe. Una constante y no una
 * función: no depende de nada, y una función sin argumentos invitaba a buscarle
 * una dependencia que no tiene. Tiene que ser ≤ `LIDERAZGO.heroe.base`, y lo
 * vigila un test de datos (`tropa.test.ts`): ver el `_comment` del JSON.
 */
export const GARRISON_LEADERSHIP: number = LIDERAZGO.guarnicion;

/**
 * Cuántos individuos pisan el tablero con un héroe, sin contarle a él: el
 * héroe ocupa el séptimo puesto de su bando (fase 1b: está en el tablero).
 */
export const CUPO_HEROE: number = LIDERAZGO.maxPorBando - 1;

/** Cuántos individuos guarda un castillo sin héroe, o trae un monstruo. */
export const CUPO_GUARNICION: number = LIDERAZGO.maxPorBando;

/**
 * Lo que le cabe a un héroe: `tope` de liderazgo y `cupo` de individuos. Juntos
 * porque se piden juntos —reclutar, recoger la guarnición, la IA que mira si
 * merece la pena volver a casa— y separados se escribían a mano en cada uno.
 */
export function capacidadDe(hero: { readonly experience: number }): {
  readonly tope: number;
  readonly cupo: number;
} {
  return { tope: heroLeadership(hero), cupo: CUPO_HEROE };
}

/**
 * Cuántos individuos de esa criatura caben todavía: bajo el `tope` de
 * liderazgo **y** bajo el `cupo` de individuos. Son dos límites y no uno porque
 * miden cosas distintas —el liderazgo decide QUÉ cabe, el cupo CUÁNTOS pisan el
 * tablero— y el que muerde antes depende de la criatura: seis campesinos ocupan
 * 12 de 20 y ya no cabe el séptimo.
 */
export function troopRoom(army: Army, tope: number, cupo: number, creatureId: string): number {
  return cabenEnElHueco(army, tope, cupo, creature(creatureId).leadership);
}

function cabenEnElHueco(army: Army, tope: number, cupo: number, ocupaUno: number): number {
  const libre = tope - armyLeadership(army);
  const porLiderazgo = libre <= 0 ? 0 : Math.floor(libre / ocupaUno);
  return Math.max(0, Math.min(porLiderazgo, cupo - army.length));
}

/**
 * Por qué no caben `n` individuos de `creatureId` en este ejército, o `null`.
 *
 * Devuelve la frase y no lanza, igual que `buildBlocker` y `castBlocker`: la
 * lee quien rechaza (`applyAdventureAction`, que lanza con ella), y la puede
 * leer la pantalla para explicar por qué un botón no hace nada.
 *
 * El cupo de individuos se mira primero: si los dos se pasan, «ya lleva 6 de 6»
 * es la frase que se entiende sin hacer cuentas.
 */
export function troopBlocker(
  army: Army,
  tope: number,
  cupo: number,
  creatureId: string,
  n: number,
  quien = 'el ejército',
): string | null {
  const info = creature(creatureId);
  const ocupa = armyLeadership(army);
  const pide = info.leadership * n;
  const caben = cabenEnElHueco(army, tope, cupo, info.leadership);
  const coletilla = caben > 0 ? `; caben ${caben}` : '';
  if (army.length + n > cupo) {
    if (army.length >= cupo)
      return `no cabe: ${quien} ya lleva ${army.length} de ${cupo} individuos`;
    const son = n === 1 ? 'es uno' : `son ${n}`;
    return `no cabe: ${quien} lleva ${army.length} de ${cupo} individuos y ${n} × ${info.name} ${son} más${coletilla}`;
  }
  if (ocupa + pide <= tope) return null;
  const verbo = n === 1 ? 'pide' : 'piden';
  return `no cabe: ${quien} ocupa ${ocupa} de ${tope} de liderazgo y ${n} × ${info.name} ${verbo} ${pide}${coletilla}`;
}

/** El ejército con `n` individuos más de esa criatura, al final. */
export function withTroops(army: Army, creatureId: string, n: number): Army {
  const nuevos: Troop[] = Array.from({ length: n }, () => ({ creature: creatureId }));
  return [...army, ...nuevos];
}

/**
 * El ejército que escriben unos grupos de tropa —«5 × piquero»—, en individuos
 * y en su orden. Es como se escriben a mano una guarnición de los datos y un
 * grupo de asaltantes, y como el grupo vuelve a ser ejército al abrir batalla.
 */
export function ejercitoDe(grupos: readonly GrupoDeTropa[]): Army {
  let army: Army = [];
  for (const g of grupos) army = withTroops(army, g.creature, g.count);
  return army;
}

/**
 * La inversa de `ejercitoDe`: un ejército de criaturas del catálogo, agrupado
 * en su orden (`troopSummary`). Lanza con un personaje dentro, que es uno y
 * tiene nombre: no se escribe como «1 × character». Y con un veterano, que en
 * «3 × piquero» perdería su experiencia sin que nadie lo dijera: hoy solo lo
 * llaman los asaltantes, que no acumulan, y el día que acumulen tendrán que
 * guardarse como `Army` y no como grupos.
 */
export function gruposDe(army: Army): GrupoDeTropa[] {
  return troopSummary(army, undefined).map((g) => {
    if (g.member !== undefined) {
      throw new Error(
        `el personaje ${g.member} no cabe en unos grupos de tropa: es uno y tiene nombre`,
      );
    }
    if (g.veterania !== undefined) {
      throw new Error(
        `el ${g.unit.name} veterano ${g.veterania.id} no cabe en unos grupos de tropa: perdería su experiencia`,
      );
    }
    return { creature: g.creature, count: g.count };
  });
}

/** Cuántos individuos escriben unos grupos de tropa. */
export function individuosDe(grupos: readonly GrupoDeTropa[]): number {
  let n = 0;
  for (const g of grupos) n += g.count;
  return n;
}

/**
 * Reparte `entrantes` entre lo que cabe en `army` bajo `tope` de liderazgo y
 * `cupo` de individuos, y lo que no, en orden: el que no cabe se salta y se
 * prueba el siguiente, así que un dragón que no entra no deja fuera a los
 * esqueletos que vienen detrás.
 *
 * Es lo que hace un héroe al entrar en su castillo —se lleva lo que le quepa y
 * el resto se queda guardándolo— y lo que la IA mira para saber si merece la
 * pena el viaje. No lanza: llevarse la guarnición no es una petición, y lo que
 * no cabe no se pierde.
 */
export function troopsThatFit(
  army: Army,
  tope: number,
  cupo: number,
  entrantes: Army,
): { readonly dentro: Army; readonly fuera: Army } {
  let libre = tope - armyLeadership(army);
  let plazas = cupo - army.length;
  const dentro: Troop[] = [];
  const fuera: Troop[] = [];
  for (const t of entrantes) {
    const ocupa = troopLeadership(t);
    if (plazas > 0 && ocupa <= libre) {
      plazas--;
      dentro.push(t);
      libre -= ocupa;
    } else {
      fuera.push(t);
    }
  }
  return { dentro, fuera };
}

/**
 * La tropa como entrada del motor de batalla: un stack de 1 por individuo, en
 * el mismo orden —que es el de despliegue y el de desempate de iniciativa—.
 */
export function troopsAsStacks(army: Army): Stack[] {
  return army.map((t) => ({ ...t, count: 1 }));
}

/** Una fila del ejército agrupado: lo que se pinta y lo que viaja al agente. */
export interface TroopGroup {
  readonly creature: string;
  readonly member?: string;
  readonly unit: UnitInfo;
  readonly count: number;
  /** Un veterano va solo en su fila, con su hoja y su rango. */
  readonly veterania?: Veterania;
  /**
   * El rango (la experiencia): 1 en una fila de novatos. El NIVEL no va aquí: es
   * el de `unit` (`nivelDeUnidad`), y quien lo pinta lo pide.
   */
  readonly rango: number;
  /** La experiencia con la que sube al siguiente; `null` en el tope o sin experiencia. */
  readonly siguiente: number | null;
}

/**
 * El ejército agrupado por criatura, en orden de primera aparición; cada
 * personaje y cada veterano en su propia fila, porque es uno y tiene nombre o
 * historia: tres piqueros de rango 1, 3 y 4 no son «3 × piquero».
 *
 * **Es el único sitio que agrupa.** Lo leen la vista del agente, el panel del
 * cliente y el resumen del servidor; si cada uno agrupara por su cuenta, el
 * día que un personaje aparezca en uno de ellos los otros dos lo contarían como
 * «3 × character».
 */
export function troopSummary(army: Army, characters: Personajes): TroopGroup[] {
  const grupos: TroopGroup[] = [];
  const porCriatura = new Map<string, number>();
  for (const t of army) {
    if (t.member !== undefined || t.veterania !== undefined) {
      const rango = rangoDeTropa(t.veterania);
      grupos.push({
        creature: t.creature,
        ...(t.member === undefined ? {} : { member: t.member }),
        ...(t.veterania === undefined ? {} : { veterania: t.veterania }),
        unit: troopUnit(t, characters),
        count: 1,
        rango,
        siguiente:
          t.veterania === undefined
            ? null
            : siguienteUmbral(t.veterania.experiencia, RANGO_MAXIMO_DE_TROPA),
      });
      continue;
    }
    const i = porCriatura.get(t.creature);
    if (i === undefined) {
      porCriatura.set(t.creature, grupos.length);
      grupos.push({
        creature: t.creature,
        unit: creature(t.creature),
        count: 1,
        rango: 1,
        siguiente: null,
      });
    } else {
      const g = grupos[i]!;
      grupos[i] = { ...g, count: g.count + 1 };
    }
  }
  return grupos;
}

/**
 * El índice del individuo de `creatureId` que se iría primero al licenciar uno
 * de ese tipo, o −1 si no hay ninguno. Los personajes no cuentan: no se licencian.
 */
function indiceDelQueSeIria(army: Army, creatureId: string): number {
  let elegido = -1;
  let menos = Number.POSITIVE_INFINITY;
  let menosPiezas = Number.POSITIVE_INFINITY;
  army.forEach((t, i) => {
    if (t.creature !== creatureId || t.member !== undefined) return;
    const exp = t.veterania?.experiencia ?? 0;
    const piezas = piezasPuestas(t.veterania?.equipo).length;
    // `<=` y no `<`: a igual experiencia y equipo gana el de más atrás. Y a igual
    // experiencia se va antes el que lleva menos: un novato recién equipado no
    // tiene experiencia, y sin esta clave se iba él por ser el último en llegar
    // —sus piezas vuelven a la mochila, pero sobraba el viaje—.
    if (exp < menos || (exp === menos && piezas <= menosPiezas)) {
      elegido = i;
      menos = exp;
      menosPiezas = piezas;
    }
  });
  return elegido;
}

/**
 * El individuo de `creatureId` que se iría primero al licenciar uno de ese tipo,
 * o `null` si el ejército no lleva ninguno: **el de menos experiencia**; a igual
 * experiencia, **el que lleva menos piezas**, y a igualdad de las dos, **el último
 * en llegar**.
 *
 * Es LA regla de quién se va, y tiene tres lectores: `sinIndividuos` —la acción
 * `dismiss`—, la IA que planea licenciar (`laMasBarata`) y el botón del panel, que
 * va solo en la fila de quien se iría. Estaba escrita tres veces, y si una
 * hubiera desempatado distinto, la IA habría creído licenciar a un novato y la
 * acción se habría llevado a otro, o el botón habría estado en la fila de un
 * veterano que el clic no tocaba.
 */
export function elQueSeIria(army: Army, creatureId: string): Troop | null {
  return army[indiceDelQueSeIria(army, creatureId)] ?? null;
}

/**
 * El ejército sin `count` individuos de `creatureId`, quitados de uno en uno con
 * `elQueSeIria`. El resto conserva su orden, que es el de despliegue.
 *
 * Lo usan la acción `dismiss` y la IA que la planea, para que lo que la IA cree
 * que queda sea lo que queda. Licenciar por tipo y no por individuo es lo que
 * deja el contrato del agente como estaba: «licencia dos piqueros» sigue
 * significando lo mismo, y el veterano no se va mientras haya un novato de su
 * tipo.
 */
export function sinIndividuos(army: Army, creatureId: string, count: number): Army {
  return licenciar(army, creatureId, count).queda;
}

/**
 * Lo mismo que `sinIndividuos`, y además **quiénes se van**: la acción `dismiss`
 * los necesita para devolver a la mochila del héroe lo que llevaran puesto. Es
 * la misma función por debajo, así que lo que se va y lo que queda no pueden
 * contarse distinto.
 */
export function licenciar(
  army: Army,
  creatureId: string,
  count: number,
): { readonly queda: Army; readonly seVan: readonly Troop[] } {
  const queda = [...army];
  const seVan: Troop[] = [];
  for (let n = 0; n < count; n++) {
    const i = indiceDelQueSeIria(queda, creatureId);
    if (i === -1) break;
    seVan.push(...queda.splice(i, 1));
  }
  return { queda, seVan };
}
