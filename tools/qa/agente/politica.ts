/**
 * La política tonta con la que el arnés de QA juega la partida.
 *
 * Vive aparte de `verify-agent.ts` por un motivo práctico: aquel módulo LEVANTA
 * el servidor en cuanto se importa, así que no se puede probar sin abrir dos
 * procesos y dos puertos. Aquí no hay nada que arranque, y por eso la rama que
 * el circuito no alcanza —un `kind` que nadie emite— se puede ver morder desde
 * un test normal.
 *
 * No pretende jugar bien. Pretende ejercitar el circuito entero: construir,
 * reclutar, comprar y equipar, moverse y, en batalla, pegar a algo.
 */

import { JUGADA_DE_MURALLA } from '../../../src/core/contract/vocabulario.js';
import { planDelAgente } from '../../../src/core/map/generar/construir.js';
import { LADO_MINIMO_DEL_GENERADOR } from '../../../src/core/map/generar/plan.js';
import { generateMapPlan } from '../../../src/core/map/generar/procedimental.js';
import { createRng } from '../../../src/core/rng.js';

/**
 * La firma con la que se reconoce el mapa del arnés.
 *
 * Es lo que tapa el riesgo de dar verde sin haber ejercitado #27: si el plan que
 * manda esta política se rechazara, el servidor jugaría el procedimental y
 * `pnpm qa` saldría igual de verde sin haber probado nada del mapa del agente.
 * Con la firma puesta, el arnés puede exigir en el primer `game_state` que el
 * pueblo se llame así — y si no se llama, es rojo.
 */
export const FIRMA_DEL_MAPA = 'qa-town-';

/** Una línea de `withHero`: novatos de un tipo, o un veterano por su id. */
type Linea = { creature: string; count: number } | { veteran: string };

/** Las líneas que describen `army` (la vista del contrato) tal cual, con los novatos juntos por tipo. */
function lineasDe(army: readonly any[]): Linea[] {
  const novatos = new Map<string, number>();
  const lineas: Linea[] = [];
  for (const g of army) {
    if (g.id !== undefined) lineas.push({ veteran: String(g.id) });
    else novatos.set(g.creature, (novatos.get(g.creature) ?? 0) + Number(g.count));
  }
  return [...lineas, ...[...novatos].map(([creature, count]) => ({ creature, count }))];
}

/** `lineas` con `n` novatos más (o menos) de `creature`; la línea que se queda en 0 se va. */
function conNovatos(lineas: readonly Linea[], creature: string, n: number): Linea[] {
  const otras = lineas.filter((l) => !('creature' in l) || l.creature !== creature);
  const antes = lineas.find(
    (l): l is Extract<Linea, { creature: string }> => 'creature' in l && l.creature === creature,
  );
  const count = (antes?.count ?? 0) + n;
  return count > 0 ? [...otras, { creature, count }] : otras;
}

/** Lo que la política cuenta una vez de la foto del turno, para el reparto y para dejar y recoger. */
interface Cuentas {
  /** Cuántos individuos caben con el héroe: el tope de la partida menos él. */
  readonly cabe: number;
  /** Cuántos lleva el héroe de dentro, y cuántos guarda su ciudad. */
  readonly lleva: number;
  readonly enCasa: number;
  /** El primer grupo de novatos del héroe, y el primero de la guarnición. */
  readonly suyo: any;
  readonly deCasa: any;
}

/**
 * Dos `distribute_troops` con el héroe `dentro` de su ciudad `town`: uno que mueve
 * a un novato y otro que lo deja todo como estaba (un reparto que no mueve a nadie
 * se rechaza, y el segundo mueve al del primero). Como dejar y recoger: si la
 * guarnición tiene sitio, se deja uno; si no y el héroe lo tiene, se recoge uno; y
 * con los dos llenos se cambia uno por otro de distinto tipo, que es para lo que
 * existe la jugada. Tras los dos, la partida está como en la foto del turno, y lo
 * que la política decide después con ella sigue valiendo.
 */
function repartos(town: any, dentro: any, cuentas: Cuentas): unknown[] {
  if (dentro === undefined) return [];
  const { cabe, lleva, enCasa, suyo, deCasa } = cuentas;
  const como = lineasDe(dentro.army ?? []);
  // El de la guarnición que no es del tipo del suyo: el que se cambia por él.
  const deOtroTipo =
    suyo === undefined
      ? undefined
      : town?.garrison?.find((g: any) => g.id === undefined && g.creature !== suyo.creature);
  let movido: Linea[] | null = null;
  if (suyo !== undefined && enCasa < cabe + 1) movido = conNovatos(como, suyo.creature, -1);
  else if (deCasa !== undefined && lleva < cabe) movido = conNovatos(como, deCasa.creature, 1);
  else if (deOtroTipo !== undefined) {
    movido = conNovatos(conNovatos(como, suyo.creature, -1), deOtroTipo.creature, 1);
  }
  if (movido === null) return [];
  const reparto = (withHero: Linea[]) => ({ type: 'distribute_troops', hero: dentro.id, withHero });
  return [reparto(movido), reparto(como)];
}

/**
 * La obra que sigue a cada `upgrade` de un nodo, con las palabras del contrato y
 * escritas aquí: el arnés hace de agente, y el agente no lee las tablas del núcleo.
 */
const OBRA_QUE_SIGUE: Readonly<Record<string, string | null>> = {
  none: 'palisade',
  palisade: 'wall',
  wall: null,
};

/**
 * La obra que sigue en el puesto donde amanece un héroe suyo, **dos veces**: la
 * primera entra y la segunda se rechaza («ya tiene la empalizada…»), que es como
 * el arnés ve el rechazo con su motivo. No mira el oro: si no alcanza, lo dice el
 * núcleo al rechazarla, y que la obra llegue a constar lo exige la búsqueda de la
 * semilla (`faltaParaElArnes`).
 */
function obras(payload: any): unknown[] {
  for (const h of payload.heroes ?? []) {
    const nodo = (payload.knownMap?.objects ?? []).find(
      (o: any) =>
        o.kind === 'node' &&
        o.owner === payload.you?.player &&
        o.at?.x === h.at?.x &&
        o.at?.y === h.at?.y,
    );
    if (nodo === undefined) continue;
    const obra = OBRA_QUE_SIGUE[String(nodo.upgrade)];
    // Un `upgrade` que no es del contrato no es «ya amurallado»: es un contrato roto.
    if (obra === undefined) {
      throw new Error(
        `el nodo ${String(nodo.id)} trae "upgrade": ${JSON.stringify(nodo.upgrade)}, que el arnés no conoce: valen ${Object.keys(OBRA_QUE_SIGUE).join(', ')}`,
      );
    }
    if (obra === null) continue;
    const mejora = { type: 'upgrade_outpost', hero: h.id, upgrade: obra };
    return [mejora, mejora];
  }
  return [];
}

/**
 * Lo que se le manda al servidor como respuesta a una petición. `semilla` es la
 * de la partida del arnés: de ella sale el plan de mapa (`map_generate`), y la
 * busca `partida-del-arnes.ts` en vez de escribirla aquí.
 */
export function decidir(kind: string, payload: any, semilla: number): unknown {
  switch (kind) {
    case 'adventure_turn': {
      const town = payload.towns?.[0];
      const dentro = payload.heroes?.find(
        (h: any) => town?.at !== undefined && h.at?.x === town.at.x && h.at?.y === town.at.y,
      );
      // Lleno es lo que dice el contrato: el tope de la partida menos el héroe
      // (`you.combat.troopCap`). Con un 6 escrito aquí, `pnpm qa` con tope 3 o 5
      // no licenciaba nunca y salía 1. Se mira antes de mandar nada: sin él, lo
      // que se compare contra `cabe` se compara contra `NaN`.
      const cabe = Number(payload.you?.combat?.troopCap) - 1;
      if (!Number.isInteger(cabe)) {
        throw new Error(
          'el turno no trae "you.combat.troopCap": el arnés no sabe cuánta tropa cabe',
        );
      }
      const lleva = (dentro?.army ?? []).reduce((n: number, g: any) => n + g.count, 0);
      const enCasa = (town?.garrison ?? []).reduce((n: number, g: any) => n + g.count, 0);
      const suyo = dentro?.army?.find((g: any) => g.id === undefined);
      const deCasa = town?.garrison?.find((g: any) => g.id === undefined);
      // Lo primero del turno, cuando la foto aún es exacta: el reparto y la obra
      // del puesto, delante también del `build`, que podría dejar la obra sin oro.
      // Es como el arnés cruza `distribute_troops` y `upgrade_outpost` por el
      // circuito; que consten lo mira `verify-agent.ts`.
      const acciones: unknown[] = [
        ...repartos(town, dentro, { cabe, lleva, enCasa, suyo, deCasa }),
        ...obras(payload),
      ];
      const obra: string | undefined = town?.canBuildNow?.[0]?.id;
      if (obra !== undefined) acciones.push({ type: 'build', town: town.id, building: obra });
      // Lo primero que se pueda reclutar de la foto del turno. Ya no hay mejoras de
      // morada que se lleven lo disponible a otra unidad (19-10-2026).
      const reclutable = town?.recruitable?.find((r: any) => r.available > 0);
      // El equipo, antes de licenciar —que podría llevarse al novato elegido—: con
      // el héroe en una ciudad con armería se compra la primera pieza que vende, y
      // se le pone al primero de su tropa que todavía no tiene id —un novato, que
      // pasa a tenerlo—; sin armería, lo primero de la mochila del primer héroe que
      // lleve algo. Es como el arnés cruza `buy_item` y `equip` por el circuito.
      const enVenta = dentro === undefined ? undefined : town?.armory?.[0]?.item;
      if (enVenta !== undefined) acciones.push({ type: 'buy_item', town: town.id, item: enVenta });
      const portador =
        enVenta !== undefined
          ? dentro
          : payload.heroes?.find((h: any) => (h.backpack?.length ?? 0) > 0);
      const pieza = enVenta ?? portador?.backpack?.[0];
      const novato = portador?.army?.find((g: any) => g.id === undefined);
      if (pieza !== undefined && novato !== undefined) {
        acciones.push({ type: 'equip', hero: portador.id, item: pieza, creature: novato.creature });
      }
      // Con el héroe dentro y su tropa llena (`cabe`), el `recruit` no cabe: se
      // licencian dos del primero que lleve para hacerle sitio. Es como el arnés
      // ejercita `dismiss` por el circuito entero.
      const primero = dentro?.army?.find((g: any) => g.count >= 2);
      // Dos, o uno si el grupo es de dos: se licencia por tipo, y con tope 3 el
      // grupo de dos se iba entero con el novato que se acaba de equipar en este
      // mismo turno, y ningún individuo llegaba equipado a `pnpm qa` (QA de la
      // complejidad, vuelta 2, 22-10-2026). Uno con pieza no se va mientras quede
      // un novato sin ella (`elQueSeIria`).
      if (reclutable !== undefined && lleva >= cabe && primero !== undefined) {
        const count = Math.min(2, primero.count - 1);
        acciones.push({ type: 'dismiss', hero: dentro.id, creature: primero.creature, count });
      }
      if (reclutable !== undefined) {
        acciones.push({
          type: 'recruit',
          town: town.id,
          creature: reclutable.creature,
          count: Math.min(2, reclutable.available),
        });
      }
      // La guarnición ya no se recoge sola (04-11-2026): con el héroe en su ciudad,
      // deja uno de su primer grupo y lo vuelve a recoger, o al revés si la
      // guarnición está llena. Es como el arnés cruza `leave_troops` y
      // `take_troops` por el circuito; que conste lo mira `verify-agent.ts`.
      if (dentro !== undefined && suyo !== undefined && enCasa < cabe + 1) {
        const una = { hero: dentro.id, creature: suyo.creature, count: 1 };
        acciones.push({ type: 'leave_troops', ...una }, { type: 'take_troops', ...una });
      } else if (dentro !== undefined && deCasa !== undefined) {
        const una = { hero: dentro.id, creature: deCasa.creature, count: 1 };
        acciones.push({ type: 'take_troops', ...una }, { type: 'leave_troops', ...una });
      }
      const hero = payload.heroes?.[0];
      if (hero !== undefined) {
        // Un cofre sin recoger o un nodo sin dueño: lo que cambia de dueño al
        // pisarlo es el nodo.
        const objetivo = payload.knownMap?.objects?.find(
          (o: any) => (o.kind === 'chest' && !o.taken) || (o.kind === 'node' && o.owner === null),
        );
        acciones.push({
          type: 'move_hero',
          hero: hero.id,
          to: objetivo?.at ?? { x: hero.at.x + 1, y: hero.at.y },
        });
      }
      return { actions: acciones, reasoning: 'qa: construyo, recluto y exploro' };
    }
    case 'battle_turn': {
      // Golpear si se puede y, si no, el PRIMER `move` de la lista, que es una
      // casilla vecina: desde el turno en tramos (02-10-2026) eso deja el turno
      // abierto y se vuelve a preguntar por la misma unidad, que es lo que el
      // arnés exige ver cruzar el circuito dos veces seguidas.
      // El poder, si lo hay: es como el arnés cruza `power` por el circuito.
      // Al golpear, el golpe de la rueda va por turno (`turnId`) de la lista
      // "hits": así cruzan todos los tipos, no siempre el mismo.
      // Contra una muralla (la de una ciudad o un pueblo, fase 2 del puesto
      // fronterizo), lo de la muralla antes que andar: subir, poner la escalera o,
      // defendiendo, la puerta; es como el arnés cruza esas cuatro jugadas.
      const acciones = payload.legalActions as any[];
      // Subir antes que poner, cerrar antes que abrir: el orden de siempre de la
      // política, con los nombres de la tabla del contrato.
      const deMuralla = [
        JUGADA_DE_MURALLA.subir,
        JUGADA_DE_MURALLA.poner_escalera,
        JUGADA_DE_MURALLA.cerrar_puerta,
        JUGADA_DE_MURALLA.abrir_puerta,
      ];
      const elegida =
        acciones.find((a) => a.type === 'power') ??
        acciones.find((a) => a.type === 'aim') ??
        acciones.find((a) => a.type === 'throw') ??
        acciones.find((a) => a.type === 'attack') ??
        deMuralla.map((t) => acciones.find((a) => a.type === t)).find((a) => a !== undefined) ??
        acciones.find((a) => a.type === 'move') ??
        acciones[0];
      const hits: any[] = payload.hits ?? [];
      if (elegida?.type === 'attack' && hits.length > 0) {
        return { action: { ...elegida, hit: hits[Number(payload.turnId) % hits.length].hit } };
      }
      return { action: elegida };
    }
    case 'battle_response': {
      // Una de la lista, por turno, como el golpe: elegir de la lista nunca falla.
      const respuestas: any[] = payload.responses ?? [];
      const n = Number(payload.turnId ?? 0);
      return { response: respuestas[(n + 3) % respuestas.length]?.response };
    }
    case 'map_generate': {
      // El plan sale del generador procedimental y NO se dibuja a mano: su
      // conectividad ya cumple `validateMapPlan` —cada inicio llega a cada
      // pueblo—, y escribir un mapa aquí sería inventarse esa conectividad
      // además del mapa. Lo único que se cambia son los ids y los nombres, que
      // es lo que lo hace reconocible.
      //
      // La semilla ya no se escribe aquí: era la 7, luego la 3, la 5, la 3, la 9
      // y otra vez la 7, re-buscada a mano cada vez que el generador cambiaba
      // y el arnés se quedaba sin batallas, sin equipo o sin asaltantes en seis
      // turnos. La busca `partida-del-arnes.ts` jugando la partida entera en el
      // proceso, con lo que el arnés exige ver como criterio (#131).
      const want = payload?.want ?? {};
      const plan = generateMapPlan(createRng(semilla), {
        width: Number(want.width ?? LADO_MINIMO_DEL_GENERADOR),
        height: Number(want.height ?? LADO_MINIMO_DEL_GENERADOR),
      });
      // El generador guarda sus caminos como tramos y el esquema del agente no
      // los tiene: zod los quitaba sin decir nada y el mapa salía sin un camino
      // (con #153, `pnpm qa` dejó de ver batallas por eso). `planDelAgente` lo
      // escribe como lo escribe el agente.
      return {
        plan: {
          ...planDelAgente(plan),
          towns: plan.towns.map((t, i) => ({
            ...t,
            id: `${FIRMA_DEL_MAPA}${i}`,
            name: `Pueblo QA ${i}`,
          })),
        },
        reasoning: 'qa: el plan del generador, firmado para que se vea cuál se juega',
      };
    }
    case 'hero_from_troop': {
      // El nombre lleva el id del veterano para que el arnés lo reconozca en el
      // `adventure_turn` siguiente —«QA veterano-N»—, y el tipo es el primero que
      // se le ofrece: elegir de la lista nunca falla, que es lo que se quiere
      // ver cruzar. Romperlo a mano es cambiar esto por un tipo inventado.
      const veterano = String(payload?.veteran?.id ?? '¿?');
      return {
        name: `QA ${veterano}`,
        story: `Un ${payload?.veteran?.creatureName ?? 'soldado'} que sobrevivió a ${payload?.veteran?.battles ?? 0} batallas.`,
        heroType: payload?.heroTypes?.[0]?.id,
        reasoning: 'qa: el primer tipo de la lista',
      };
    }
    case 'town_voices': {
      // Una línea por persona que la nombra —«QA <npc>»—, para que el arnés la
      // reconozca luego si quiere. Pedir lo que se ofrece nunca falla, que es lo
      // que se quiere ver cruzar.
      const voices = (payload?.towns ?? []).flatMap((t: any) =>
        (t.npcs ?? []).map((n: any) => ({ town: t.id, npc: n.id, lines: [`QA ${n.id}`] })),
      );
      return { voices, reasoning: 'qa: una línea por persona' };
    }
    default:
      // Antes esto devolvía `{}`. Un `{}` no valida contra ningún esquema, así
      // que zod lo rechazaba en el servidor… y el arnés lo contaba como turno
      // bueno, porque `heroes_respond` no da `isError` en ese caso. El circuito
      // se rompía y la verificación salía verde.
      throw new Error(
        `esta política no sabe responder a "${kind}": añádele una rama antes de emitir ese kind`,
      );
  }
}
