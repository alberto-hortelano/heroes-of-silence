/**
 * Contrato entre el juego y el agente que hace de modelo.
 *
 * Cada petición lleva un `kind` y **embebe su propio esquema de respuesta**,
 * como en el `narrative_listen` de ne-fan: así el agente no tiene que recordar
 * el formato entre turnos ni consultar documentación aparte.
 *
 * Todo lo que llega del agente se valida con zod ANTES de tocar el estado. Una
 * respuesta mal formada se rechaza con un mensaje que dice qué falta.
 *
 * En los hechos de la crónica que se le entregan (`recentEvents`), **el
 * protagonista es siempre `actor`**, y no hay ningún otro campo que diga lo
 * mismo: siete variantes llevaban además un `player` o un `winner` con el valor
 * repetido, y nada comprobaba que coincidieran. `winner` sigue existiendo solo
 * en `battle_ended`, donde significa otra cosa — el bando que gana la batalla,
 * `attacker` o `defender`, no un jugador.
 */
import { z } from 'zod';
import { FORMA_DEL_TABLERO } from '../battle/board.js';
import { CARGA, CARGA_MINIMA } from '../battle/carga.js';
import { PODERES, queHaceElPoder } from '../battle/poderes.js';
import { HERO_BODY } from '../battle/types.js';
import { ECONOMIA } from '../data.js';
import { EQUIPO_BASE, REGLA_DEL_ESCUDO } from '../hero/equipo.js';
import { RANGO_MAXIMO_DE_TROPA } from '../hero/experiencia.js';
import { LADO_MAXIMO_DEL_PLAN, LADO_MINIMO_DEL_PLAN } from '../map/generate.js';
import { LADO_DEL_RECINTO, SEPARACION_DE_CIUDADES } from '../map/recinto.js';
import {
  BARRERAS,
  BARRERAS_DE_DESNIVEL,
  esNivel,
  NIVELES,
  QUE_ES_UN_NIVEL,
  TERRAIN_KINDS,
} from '../map/terrain.js';
import { MAX_HEROES_PER_PLAYER } from '../state/game.js';
import { REGLA_DEL_PUEBLO } from '../state/renta.js';
import { LARGO_DE_LINEA, LINEAS_POR_VECINO, MAX_VOCES_POR_RESPUESTA } from '../town/voces.js';
import { FACTION_IDS, HUECOS, TIPOS_DEL_ANILLO } from '../types.js';
import { HIT_DE_GOLPE, HITS, SLOT_DE_HUECO, SLOTS } from './vocabulario.js';

/** Los poderes de unidad, por su id y con lo que hacen (`queHaceElPoder`, lo que lee el panel). */
const PODERES_EN_PROSA = PODERES.map((p) => `"${p.id}" (${p.nombre}: ${queHaceElPoder(p)})`).join(
  ', ',
);

/** El anillo de la rueda en el contrato: «"offensive", "strong"…», en su orden. */
const ANILLO_EN_PROSA = TIPOS_DEL_ANILLO.map((t) => `"${HIT_DE_GOLPE[t]}"`).join(', ');

/** Los huecos que el héroe trae puestos al nacer y los que trae vacíos, derivados del equipo base. */
const HUECOS_DE_SERIE = HUECOS.flatMap((h) => {
  const id = EQUIPO_BASE[h];
  return id === undefined ? [] : [`"${id}" en "${SLOT_DE_HUECO[h]}"`];
}).join(' y ');
const VACIOS_DE_SERIE = HUECOS.filter((h) => EQUIPO_BASE[h] === undefined).map(
  (h) => `"${SLOT_DE_HUECO[h]}"`,
);

import { lineaLegible } from './linea.js';
import { CATALOGO_DE_EQUIPO_EN_PROSA, COMO_SE_LEE_EL_MAPA } from './serialize.js';

// ---------------------------------------------------------------- respuestas

export const pointSchema = z.object({ x: z.number().int(), y: z.number().int() });
export const hexSchema = z.object({ col: z.number().int(), row: z.number().int() });

export const adventureActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('move_hero'), hero: z.string(), to: pointSchema }),
  z.object({ type: z.literal('hire_hero'), town: z.string() }),
  z.object({ type: z.literal('build'), town: z.string(), building: z.string() }),
  z.object({
    type: z.literal('recruit'),
    town: z.string(),
    creature: z.string(),
    count: z.number().int().positive(),
  }),
  z.object({
    type: z.literal('dismiss'),
    hero: z.string(),
    creature: z.string(),
    count: z.number().int().positive(),
  }),
  // `item`, `veteran` y `creature` van como texto libre: que existan, que sean
  // suyos y que quepan lo dice el núcleo (`buyBlocker`, `equipBlocker`), y el
  // motivo viaja en el veredicto como el de cualquier acción descartada. El hueco
  // sí se acota aquí, porque es una lista cerrada que no depende de la partida.
  z.object({ type: z.literal('buy_item'), town: z.string(), item: z.string() }),
  z.object({
    type: z.literal('equip'),
    hero: z.string(),
    item: z.string(),
    veteran: z.string().optional(),
    creature: z.string().optional(),
  }),
  z.object({
    type: z.literal('unequip'),
    hero: z.string(),
    // Texto, como `item` y `creature`: lo valida el núcleo (`unequipBlocker`) y un
    // hueco mal escrito descarta esta acción con su motivo, no el turno entero.
    slot: z.string(),
    veteran: z.string().optional(),
  }),
  z.object({ type: z.literal('end_turn') }),
]);

export const battleActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('move'), to: hexSchema }),
  // `hit`, el golpe de la rueda, va como texto y no como `z.enum`: uno mal
  // escrito descarta ESTA jugada con su motivo (`golpeDelHit`, en el director),
  // no la batalla entera. Sin él, lo elige la IA a ciegas por ti.
  z.object({
    type: z.literal('attack'),
    target: z.string(),
    from: hexSchema.optional(),
    hit: z.string().max(32).optional(),
  }),
  z.object({ type: z.literal('shoot'), target: z.string() }),
  z.object({ type: z.literal('wait') }),
  z.object({ type: z.literal('defend') }),
  z.object({ type: z.literal('cast'), spell: z.string(), target: z.string().optional() }),
  // El poder de la unidad activa (`UnitInfo.poderes`) sobre un aliado: el turno entero.
  z.object({ type: z.literal('power'), power: z.string(), target: z.string() }),
  // `gold` es opcional: viene puesto en `legalActions` y devolverla tal cual
  // vale; si se manda, tiene que ser el precio de ahora (`applyAction`).
  z.object({ type: z.literal('surrender'), gold: z.number().int().nonnegative().optional() }),
  z.object({ type: z.literal('end_turn') }),
]);

/**
 * La respuesta de la rueda cuando golpean a una unidad del agente
 * (`battle_response`). Texto y no `z.enum`, por lo mismo que `hit`: una que no
 * es un golpe se dice en el veredicto y la elige la IA a ciegas por él, sin
 * quitarle la batalla.
 */
export const battleResponseResponseSchema = z.object({
  response: z.string().max(32),
  reasoning: z.string().max(2000).optional(),
});

export const adventureTurnResponseSchema = z.object({
  /** Acciones en orden. No hace falta terminar con `end_turn`: se añade solo. */
  actions: z.array(adventureActionSchema).max(200),
  /** Opcional: por qué. Se guarda en la crónica, no afecta a las reglas. */
  reasoning: z.string().max(2000).optional(),
});

export const battleTurnResponseSchema = z.object({
  action: battleActionSchema,
  reasoning: z.string().max(2000).optional(),
});

/**
 * Los terrenos, **derivados de `TERRAIN_KINDS`** y no copiados.
 *
 * Eran tres declaraciones de la misma lista de ocho —la constante, este esquema
 * y `palette.terrains`— y la barrera que lo justificaba desapareció en este
 * mismo ciclo, cuando el contrato empezó a importar `terrain.js` para derivar
 * los costes. Con las tres a mano, el día que entre un terreno la prosa le dice
 * al agente lo que cuesta pisarlo, el esquema le rechaza el plan si lo dibuja y
 * la paleta no se lo ofrece: tres comportamientos incoherentes con un cambio y
 * ningún test rojo.
 */
export const terrainSchema = z.enum(TERRAIN_KINDS);

/**
 * Un id que el motor usa VERBATIM —en el `MapObject`, en el `Town`, en los
 * mensajes y en la consulta `map`—, así que es un contrato acotado: una `id`
 * con un salto de línea dentro se llevaba por delante el bloque de veredictos,
 * que se parsea línea a línea (`notas.ts`). NO es defensa contra XSS: eso es
 * `html.ts`.
 */
const idDeMapa = (que: string) =>
  z
    .string()
    .min(1)
    .max(32)
    .regex(
      /^[a-z0-9][a-z0-9_-]*$/,
      `un id de ${que} va en minúsculas y solo lleva letras, dígitos, guion y guion bajo, empezando por letra o dígito (p. ej. "town-0")`,
    );
const nombreDeMapa = (que: string) => lineaLegible(40, `el nombre de ${que}`);

export const mapPlanSchema = z.object({
  width: z.number().int().min(LADO_MINIMO_DEL_PLAN).max(LADO_MAXIMO_DEL_PLAN),
  height: z.number().int().min(LADO_MINIMO_DEL_PLAN).max(LADO_MAXIMO_DEL_PLAN),
  baseTerrain: terrainSchema,
  patches: z.array(
    z.object({ terrain: terrainSchema, center: pointSchema, radius: z.number().min(1).max(40) }),
  ),
  regions: z.array(
    z.object({
      id: idDeMapa('región'),
      name: nombreDeMapa('una región'),
      at: pointSchema,
      // Cualquier terreno en el esquema; que sea un suelo y no una barrera lo
      // dice `validateMapPlan`, con su frase, para los dos productores.
      terrain: terrainSchema.optional(),
      // Acotado aquí con la misma lista que mira `validateMapPlan` (#209): el
      // tipo del plan es `Nivel`, y un número suelto no casaría con él.
      nivel: z.number().refine(esNivel, QUE_ES_UN_NIVEL).optional(),
    }),
  ),
  // Derivado de la lista que valida `validateMapPlan`, no copiado: el esquema y
  // la validación de los dos productores dicen lo mismo porque es lo mismo.
  walls: z.array(z.object({ terrain: z.enum(BARRERAS), from: pointSchema, to: pointSchema })),
  nodes: z.array(pointSchema),
  towns: z.array(
    z.object({
      id: idDeMapa('ciudad'),
      name: nombreDeMapa('una ciudad'),
      faction: z.enum(FACTION_IDS),
      at: pointSchema,
      owner: z.number().int().nullable(),
    }),
  ),
  // Retirado el 19-10-2026: el héroe nace en su base. Se rechaza diciéndolo en
  // vez de dejar que zod lo quite en silencio, que es lo que hace con un campo
  // que no conoce: el agente que aún lo mande creería que sus inicios valen.
  heroStarts: z
    .never({
      message:
        'ya no hay "heroStarts": el héroe de cada jugador empieza dentro de su base (su primera ciudad en "towns"); quita el campo',
    })
    .optional(),
  // No hay minas ni más recurso que el oro: un plan que los trae se rechaza
  // diciéndolo, como `heroStarts`.
  mines: z
    .never({
      message:
        'ya no hay minas: el oro sale de las ciudades y de los pueblos ("villages") de las regiones unidas a la base; quita el campo "mines"',
    })
    .optional(),
  villages: z.array(z.object({ name: nombreDeMapa('un pueblo'), at: pointSchema })),
  resources: z
    .never({
      message:
        'ya no hay montones de recursos: el único recurso es el oro, y del mapa solo sale de los cofres ("chests"); quita el campo "resources"',
    })
    .optional(),
  monsters: z.array(
    z.object({ at: pointSchema, creature: z.string(), count: z.number().int().positive() }),
  ),
  chests: z.array(z.object({ at: pointSchema, gold: z.number().int().positive() })),
  roads: z.array(pointSchema).optional(),
  // Las criaturas van como `z.string()` y no como `z.enum`, igual que las de
  // `monsters`: quien las valida es `validateMapPlan`, la puerta de los dos
  // productores de planes, y su rechazo nombra las que valen.
  raiders: z
    .array(
      z.object({
        at: pointSchema,
        troops: z
          .array(z.object({ creature: z.string(), count: z.number().int().positive() }))
          .min(
            1,
            'un grupo de asaltantes es de 1 individuo en adelante: "troops" no puede ir vacío',
          ),
      }),
    )
    .optional(),
});

export const mapGenerateResponseSchema = z.object({
  plan: mapPlanSchema,
  reasoning: z.string().max(2000).optional(),
});

/**
 * Lo que el narrador devuelve cuando un veterano se hace héroe.
 *
 * `name` se acota como los nombres de un plan de mapa (#97): acaba en la crónica,
 * en el panel y en el bloque de veredictos, que se parsea línea a línea. `story`
 * igual, con más sitio. `heroType` va como texto libre y NO como `z.enum`, igual
 * que la criatura de `monsters`: quien lo valida es `ascensoBlocker`, que sabe la
 * facción del jugador y nombra los que valen en el rechazo; un enum de todas las
 * facciones aceptaría el tipo de la otra.
 */
export const heroFromTroopResponseSchema = z.object({
  name: nombreDeMapa('un héroe'),
  story: lineaLegible(280, 'la historia del héroe'),
  heroType: z.string(),
  reasoning: z.string().max(2000).optional(),
});

/**
 * Lo que el narrador devuelve para la gente de sus bases (`town_voices`).
 *
 * Las líneas van como texto suelto y NO como `lineaLegible`: el criterio es que
 * cada línea se rechace sola, con su motivo, y una línea mala en el esquema
 * tiraría la respuesta entera. Quien las juzga una a una es `ponerVoces`, con la
 * misma regla (`motivoDeLinea`). Lo que sí acota el esquema es la forma: de 1 a
 * `LINEAS_POR_VECINO` líneas por vecino y no más voces de las que caben.
 */
export const townVoicesResponseSchema = z.object({
  voices: z
    .array(
      z.object({
        town: z.string().max(64),
        npc: z.string().max(64),
        lines: z.array(z.string().max(2000)).min(1).max(LINEAS_POR_VECINO),
      }),
    )
    .max(MAX_VOCES_POR_RESPUESTA),
  reasoning: z.string().max(2000).optional(),
});

// ---------------------------------------------------------------- peticiones

export const REQUEST_KINDS = [
  'adventure_turn',
  'battle_turn',
  'battle_response',
  'map_generate',
  'hero_from_troop',
  'town_voices',
] as const;

export type RequestKind = (typeof REQUEST_KINDS)[number];

export const responseSchemas = {
  adventure_turn: adventureTurnResponseSchema,
  battle_turn: battleTurnResponseSchema,
  battle_response: battleResponseResponseSchema,
  map_generate: mapGenerateResponseSchema,
  hero_from_troop: heroFromTroopResponseSchema,
  town_voices: townVoicesResponseSchema,
} as const;

/**
 * Aquí había tres alias y dos no los importaba nadie. El criterio con el que se
 * decide el siguiente, escrito para quien lo lea y no enterrado en un commit:
 *
 * **Se exportan los esquemas**, que es lo que valida y de lo que todo se
 * deriva. **Un alias de `z.infer` se escribe donde se usa** —`agent-link.ts` ya
 * tipa `ask()` con `z.infer<(typeof responseSchemas)[K]>` en el sitio, que es el
 * único consumidor real del contrato—. Y **un tipo que ningún `import` nombra se
 * borra**: este paquete es `"private": true`, así que el cliente de fuera del
 * repo que justificaría «es API pública» no existe, y esta casa lleva varios
 * ciclos destruyendo capas que solo sostenía un consumidor hipotético.
 *
 * `MapGenerateResponse` se queda porque tiene uno (`mapa-del-agente.ts:53`), no
 * porque sea más importante.
 */
export type MapGenerateResponse = z.infer<typeof mapGenerateResponseSchema>;

/**
 * Descripción del formato de respuesta que viaja DENTRO de cada petición.
 * Es prosa deliberadamente: el agente lee esto en el mismo mensaje que el
 * estado, y no tiene que ir a buscar nada.
 */
export const RESPONSE_FORMAT: Readonly<Record<RequestKind, string>> = {
  adventure_turn: `Responde con:
{
  "actions": [ ...acciones en orden... ],
  "reasoning": "una línea opcional explicando el plan"
}

Acciones válidas (el turno termina solo, no hace falta enviar end_turn):
  { "type": "move_hero", "hero": "<id>", "to": { "x": N, "y": N } }
  { "type": "build",     "town": "<id>", "building": "<id de edificio>" }
  { "type": "recruit",   "town": "<id>", "creature": "<id>", "count": N }
  { "type": "dismiss",   "hero": "<id>", "creature": "<id>", "count": N }
  { "type": "buy_item",  "town": "<id>", "item": "<id de pieza>" }
  { "type": "equip",     "hero": "<id>", "item": "<id de pieza>" }
  { "type": "equip",     "hero": "<id>", "item": "<id de pieza>", "veteran": "<id de veterano>" }
  { "type": "equip",     "hero": "<id>", "item": "<id de pieza>", "creature": "<id de criatura>" }
  { "type": "unequip",   "hero": "<id>", "slot": "${SLOTS.join('" | "')}" }
  { "type": "unequip",   "hero": "<id>", "slot": "<hueco>", "veteran": "<id de veterano>" }
  { "type": "hire_hero", "town": "<id>" }
  { "type": "end_turn" }

Notas:
- "to" puede estar a varios días de marcha: el héroe avanza lo que le dé el
  día, y el veredicto dice dónde se quedó y cuántos pasos le faltan.
- Mover a la casilla de un monstruo, de un héroe enemigo, de un grupo de
  asaltantes o de un castillo defendido inicia una batalla, y esa batalla la
  juegas tú con "battle_turn".
- Cuidado con los ASALTANTES ("knownMap.raiders"): pisar la región de un grupo
  que te saca el margen de fuerza es una EMBOSCADA. El héroe se para en esa
  casilla aunque le queden puntos, y la batalla la juegas defendiendo. Si va
  directo a por la base rival por regiones sin conquistar, puede llegar con
  menos gente de la que salió —o no llegar—.
- Si al andar ves un grupo que te emboscaría más adelante en la ruta y que no
  era el que ya veías emboscarte al salir —uno que no veías, o el siguiente
  cuando por el camino ganas fuerza (la guarnición de tu base se recoge al
  pasar) y el primero deja de sacarte el margen—, el héroe se para donde lo
  ve ("march_halted" en recentEvents) y conserva lo andado; el veredicto lo
  cuenta como marcha que entró parcialmente y dice qué grupo la paró. Las
  acciones que vengan detrás se siguen aplicando; con el grupo ya a la vista
  decides el turno que viene si sigues. Una emboscada antes del destino
  también sale en el veredicto como marcha parcial.
- NIVEL y RANGO son dos cosas. El NIVEL de una unidad es la primera cifra de
  su ÍNDICE DE PODER ("powerIndex": 340 es el nivel 3), que sale de sus cifras
  CON SU EQUIPO PUESTO (ataque, defensa, PV, daño de cada arma, armadura,
  velocidad, tiro y doble golpe): nadie lo escribe. "creature_stats" da de cada
  unidad su "level", su "powerIndex", su "dwelling" (el edificio de su facción
  que la produce; uno produce varias, y el edificio no implica nivel), su equipo
  de serie ("equipment") y su "armor"; lo que cuesta y crece sale de su índice.
  El RANGO es la experiencia: la
  TROPA va del 1 al 5, y todo HÉROE empieza en el 5 —el inicial y el
  contratado— y sube sin tope (6, 7, 8…). Cada rango suma cifras (a la tropa,
  ataque y defensa; al héroe, cuerpo y LIDERAZGO, el tope de su ejército), así
  que su nivel sube cuando esas cifras lo suben.
- La EXPERIENCIA se gana por daño: quien quita PV a un enemigo —criatura o
  héroe, con golpes, disparos o hechizos— gana "PV quitados × powerIndex del
  que los recibe" (el índice entero, 100 veces el nivel o algo más), gane o
  pierda la batalla. "heroes[].rank" lleva al lado su "level",
  su "experience" y "nextRankAt" (la experiencia del rango siguiente). Una fila
  de "army" con "rank" es UN veterano, con su "level", su "experience" y
  "nextRankAt" (null en el 5). Si muere, se pierde con lo que había ganado.
- Un ejército son INDIVIDUOS, no stacks: "army[].count" dice cuántos lleva de
  cada criatura, y en batalla cada uno ocupa su hex. Dos límites deciden
  cuántos lleva: como mucho 6 individuos además del héroe, que pelea en el
  tablero y es el séptimo; y "heroes[].leadership", donde "used" es lo que
  ocupa y "max" su tope. Cada criatura ocupa lo que dice
  "recruitable[].leadership" por individuo. Un "recruit" que no quepa se
  rechaza diciendo cuántos caben, por ejemplo: "no cabe: el ejército ocupa 18
  de 20 de liderazgo y 2 × Piquero piden 8" o "no cabe: el ejército ya lleva 6
  de 6 individuos". Sin héroe en el pueblo se recluta a la guarnición, que
  guarda como mucho 7 individuos y tiene su propio tope en
  "towns[].garrisonLeadership". Un héroe que entra en su pueblo se lleva de la
  guarnición lo que le quepa; el resto se queda guardándolo. Tu base NACE con
  la guarnición llena: para reclutar en ella el primer día, entra con el héroe
  —y al entrar se lleva la parte que le quepa, que deja de defenderla—.
- "dismiss" LICENCIA individuos del ejército de un héroe que está en un castillo
  tuyo (tu base u otro): se van para siempre, no vuelven a la guarnición. Sirve
  para CAMBIAR tropa: con el liderazgo o los 6 individuos llenos de lo barato,
  un "recruit" de algo mejor no cabe; licencia primero lo que sobra y recluta
  después, en el mismo turno y en ese orden. De cada criatura se van primero
  los de MENOS experiencia: el veterano no se va mientras quede un novato de su
  tipo. Un personaje no se licencia, y fuera de un castillo tuyo se rechaza
  diciéndolo.
- EQUIPO: todo héroe y todo individuo de la tropa tiene cinco huecos
  (${SLOTS.join(', ')}) y en cada uno lleva una pieza o nada: "${SLOT_DE_HUECO.arma}" es
  el arma de cuerpo a cuerpo, "${SLOT_DE_HUECO.distancia}" la que dispara (llevarla ya
  es disparar, sin munición que contar),
  "${SLOT_DE_HUECO.lanza}" la lanza con que se carga, "${SLOT_DE_HUECO.armadura}" la
  armadura y "${SLOT_DE_HUECO.escudo}" el escudo, opcional: ${REGLA_DEL_ESCUDO}
  (ponerle uno a quien lleva un arma a dos manos, o ponerle una a quien lleva
  escudo, se rechaza diciéndolo). Cada pieza suma sus cifras a quien la lleva;
  ninguna da PV: la armadura son puntos que se restan del daño de cada golpe que
  recibe, y "stacks[].armor" de la batalla dice cuántos.
  "heroes[].equipment" es lo que lleva puesto el héroe (por hueco, el id o null) y
  "heroes[].backpack" su MOCHILA, las piezas que lleva sin poner. Todo héroe nace
  con ${HUECOS_DE_SERIE}${VACIOS_DE_SERIE.length === 0 ? '' : ` (y nada en ${VACIOS_DE_SERIE.join(', ')})`}.
  De dónde salen las piezas (lo dice cada una abajo):
  · BOTÍN: vencer a un grupo de asaltantes —atacándolo o repeliendo su
    emboscada— o tomar una ciudad NEUTRAL con guarnición deja una de las piezas
    que caen como botín, al azar, en la mochila del héroe que gana. Lo cuenta
    "recentEvents" con "loot_found".
  · ARMERÍA: en un castillo tuyo con el edificio "armory" y un héroe tuyo dentro,
    "buy_item" compra una de las piezas que se venden para su mochila;
    "towns[].armory" dice qué vende y a qué precio, y solo viene si la tiene.
  Cada fila de "army" con "id" lleva su "equipment" con la misma forma.
  "equip" pone una pieza de la mochila del héroe: sin más, al propio héroe; con
  "veteran", al individuo de su tropa con ese id (las filas de "army" con "id");
  con "creature", a un individuo de ese tipo que todavía no tenga id (uno de los
  que van agrupados en su fila), que pasa a tenerlo y a ir en su propia fila. Lo que ocupaba ese hueco vuelve a la mochila. "unequip"
  quita la pieza de un hueco y la devuelve a la mochila. Se equipa en cualquier
  sitio, fuera de batalla. La pieza de un individuo se pierde si muere; si lo
  licencias, vuelve a la mochila del héroe. Si un héroe cae sin base, pierde
  equipo y mochila. Las piezas:
${CATALOGO_DE_EQUIPO_EN_PROSA}
- ORDEN DE LOS TURNOS, en serpiente: quien cierra un día abre el siguiente
  (día 1: jugador 0 y luego 1; día 2: 1 y luego 0; día 3: 0 y luego 1…).
  "you.turnOrder" es el orden de HOY. Si cierras el día, tu siguiente turno
  llega enseguida, ya en el día nuevo y sin que el rival haya movido; si lo
  abres, el rival juega dos turnos seguidos antes de que vuelvas.
- "yourBase" es tu base: el castillo al que vuelve un héroe tuyo que pierde una
  batalla o se rinde. Vuelve con el ejército vacío (o con la tropa que salvó
  rindiéndose) y sin movimiento hasta el día siguiente; la tropa muerta se
  pierde. Si un héroe tuyo pierde defendiendo un castillo tuyo, ese castillo
  es del rival; si era la base, el héroe ya no tiene a dónde volver y se
  pierde. Sin base ("yourBase": null), un héroe que cae se pierde.
- Con un héroe dentro de una ciudad, la defiende SOLO ese héroe con su tropa:
  la guarnición NO se suma a la batalla. Esa batalla es la final: si la pierde,
  la ciudad cae con su guarnición sin que esta llegue a pelear, y si era tu
  base, pierdes la partida. Lo que el héroe se llevó al entrar sí pelea: ya es
  su tropa.
- ORO: es el ÚNICO recurso (no hay minas, ni madera, ni mineral). "you.gold"
  es tu oro y "you.income" lo que cobrarás al empezar tu próximo turno:
  "total" y de dónde sale, "towns" (cada ciudad tuya, con el "gold" que da su
  ayuntamiento; tu base es la primera; la que está cortada de tu base lleva
  "connected": false y da 0) y "villages" (cada
  pueblo de una región tuya unida a tu base, ${ECONOMIA.rentaDelPueblo} de oro cada uno). Lo
  que te cortan de la base deja de pagar. Todo "cost" —"canBuildNow",
  "recruitable", "towns[].armory"— es oro: un número. Un "build" o un
  "recruit" sin oro bastante se rechaza diciendo cuánto cuesta y cuánto tienes.
- Cada héroe trae su "type", el TIPO de héroe (un id de los de su facción), y
  el que nació de la tropa trae además su "story". El tipo todavía NO da
  ninguna habilidad: se guarda y se ve.
- Un VETERANO de rango ${RANGO_MAXIMO_DE_TROPA} —el tope de la tropa— que esté en tu base al empezar
  tu turno, en la guarnición o en la tropa de un héroe tuyo que esté allí, SE
  HACE HÉROE: antes de este turno se te pide con "hero_from_troop" que le des
  nombre, historia y tipo. Nace en la base, con su experiencia y sin movimiento
  ese día. Quien quede en la casilla del castillo —el nacido, o el héroe tuyo
  que ya estaba en ella— RECOGE LA GUARNICIÓN que le quepa, como al contratar:
  la base no se queda defendida por un héroe sin tropa.
  Con ${MAX_HEROES_PER_PLAYER} héroes no se te pide nada y el veterano ESPERA en la base
  hasta que haya sitio; mientras espere, el turno te lo dice en
  "veteransWaiting", que solo viene entonces. A cada veterano se le pregunta
  una vez; si tu respuesta no vale, no se te vuelve a preguntar hasta que salga
  de la base y vuelva.
- "towns[].teaches" son los hechizos que enseña el gremio de ese pueblo: un
  héroe tuyo parado allí los aprende solo, hasta donde le deje su Sabiduría, y
  aparecen en "heroes[].spells". NO hay acción para aprender: basta con llevarlo.
- "knownMap" es el mapa tal y como lo conoces TÚ, y es exactamente lo mismo
  que devuelve la tool "map": para elegir el "to" de un "move_hero" no hace
  falta pedirla, ya lo tienes delante.
${COMO_SE_LEE_EL_MAPA}
- "enemyHeroes" son los que ves AHORA: si no aparece ninguno, no significa que
  no haya, solo que nadie tuyo los tiene a la vista.
- "recentEvents" es lo que OBSERVABAS cuando ocurrió, no todo lo que pasó. Lo
  tuyo entra siempre, y también perder un castillo o un héroe aunque te los
  quiten lejos; del rival solo llega lo que alguien tuyo tenía a la vista en ese
  momento —y sigue llegando aunque hoy ya no lo mires: la crónica es memoria—.
  Un silencio NO significa que el rival esté quieto: significa que no lo has
  visto. Si quieres saber qué hace, ponle a alguien delante.
  Cada "battle_ended" resume la batalla: "winner" es el BANDO que gana
  ("attacker" o "defender"), "owners" de quién era cada bando (null si era
  neutral), "rounds" cuántas rondas duró, "casts" los hechizos lanzados
  ({ "side", "spell", "target": la criatura o ${JSON.stringify(HERO_BODY)} sobre la que cayó,
  "killed" }) y "lost" los individuos que perdió cada bando, por criatura (sin
  el héroe: su caída es "hero_defeated").
- Si una acción resulta ilegal se descarta y las siguientes siguen aplicándose.
- Al cerrar el turno se te dice cuántas acciones entraron y, si se descartó
  alguna, cuál y por qué. Las descartadas NO se reintentan solas.`,

  battle_turn: `Responde con:
{
  "action": { ...una sola acción... },
  "reasoning": "una línea opcional"
}

Mira "yourSide": puedes ser el atacante o el defensor. La juegas defendiendo
cuando el rival te ataca un héroe o un castillo, y también cuando unos
ASALTANTES emboscan a un héroe tuyo que ha pisado su región: entonces el
atacante es su grupo, sin héroe, y no se rinde. "stacks" con tu "side" son
los tuyos.

El tablero viene en "board": ${FORMA_DEL_TABLERO}. Una acción a una casilla
que no existe se descarta.

Acciones válidas para la unidad activa:
  { "type": "move",   "to": { "col": N, "row": N } }
  { "type": "attack", "target": "<id de stack>", "from": { "col": N, "row": N }, "hit": "<golpe>" }
  { "type": "shoot",  "target": "<id de stack>" }
  { "type": "wait" }
  { "type": "defend" }
  { "type": "cast",   "spell": "<id>", "target": "<id de stack>" }
  { "type": "power",  "power": "<id de poder>", "target": "<id de stack aliado>" }
  { "type": "surrender", "gold": N }
  { "type": "end_turn" }

Notas:
- "move" NO acaba el turno de la unidad: gasta casillas de su "stepsLeft" y se
  te vuelve a pedir acción para la misma unidad, así que puedes moverte en
  varios tramos. Tras moverse solo puede moverse más, atacar cuerpo a cuerpo o
  terminar con "end_turn": ni disparar, ni "defend", ni "wait". Atacar acaba
  el turno. Si tras un "move" ya no le queda ni casilla a la que ir ni enemigo
  al lado, el turno se cierra solo y no se te pregunta por ella.
- "turnId" numera los turnos de la batalla: mientras sea el mismo, sigues en el
  mismo turno de la misma unidad, y un "move" no lo cambia. La moral alta
  puede regalarle a una unidad un turno NUEVO: llega con otro "turnId" y su
  "stepsLeft" entero.
- El stack con "commander": true es tu HÉROE, en el tablero: pelea como una
  unidad más y, si cae, PIERDES la batalla aunque te quede tropa. Lo mismo vale
  para el del rival: matarlo gana la batalla. Su magia ("cast") funciona
  mientras esté vivo. El héroe ya no suma ataque ni defensa a la tropa: sus
  cifras son las de su stack.
- Un stack con "veteranRank" es un VETERANO (rango 2 a 5): su ataque y su
  defensa ya traen lo que da su rango. Cada PV que le quites a alguien te da
  "PV × índice de poder de quien los recibe" de experiencia (el de sus cifras
  con el equipo puesto; 100 × su nivel o algo más), así que pegar a lo fuerte enseña más. La tropa que muere pierde lo que había ganado.
- "surrender" te rinde: pierdes la batalla, pagas el oro de la rendición y tu
  héroe vuelve a la base con la tropa que siga viva. El precio es proporcional
  a la tropa que salvas y viene en su "gold" dentro de "legalActions"; el oro
  que tienes viene en "yourGold". Solo aparece cuando se puede: con base a la
  que volver, sin estar defendiéndola —no hay a dónde huir— y con oro para
  pagarlo. "gold" puedes omitirlo al responder; si lo pones, tiene que ser el
  de la lista. El veredicto te dice cuánto pagaste. La IA de reglas NUNCA se
  rinde por ti: ni cuando juega una acción tuya que se descartó ni cuando
  resuelve una batalla tuya que no juegas.
- "from" es opcional en "attack": si se indica, la unidad se mueve ahí (lo que le
  quede de "stepsLeft") y golpea; sin él golpea desde donde está, si ya está al
  lado. Puedes ELEGIR desde qué casilla golpear: cualquier "from" de la lista.
- CARGA todo el que pega cuerpo a cuerpo: un "attack" con "from" carga si ese
  "from" está en LÍNEA RECTA desde donde está la unidad ahora (una de las 6
  rectas del hexágono, sin giros ni unidades en medio), a ${CARGA_MINIMA} casillas o más, y
  el "target" está EN ESA RECTA: la casilla que sigue a "from" es suya. Llegar a
  la recta y girar para pegar al de al lado no carga, ni pegar al que ya tienes
  pegado. Cada casilla suma un ${CARGA.aPie.porcentaje} % de daño a pie, y un ${CARGA.jinete.porcentaje} % con el rasgo
  "charge" (el jinete), hasta ${CARGA.jinete.tope}; solo el primer golpe la cobra. Lo andado en
  tramos anteriores no cuenta: cada tramo se vuelve a medir. "chargeFrom" te
  lista las cargas que tienes ahora mismo: contra qué "target", desde qué
  casilla ("col", "row") y con cuántas casillas cobrarías ("hexes"); solo viene
  cuando hay alguna. Un "move" a esa casilla NO carga: solo mueve.
- SALIR DEL CONTACTO cuesta: dejar una casilla con N enemigos al lado que te
  puedan golpear cuerpo a cuerpo cuesta 1 + N de "stepsLeft". Las casillas de
  "legalActions" ya lo descuentan; si no te llega para salir, no te mueves
  (golpea, defiende o espera). La carga se paga por la recta.
- Cada golpe cuerpo a cuerpo pasa por la RUEDA DEL GOLPE: quien pega elige su
  golpe ("hit" en el "attack") y quien recibe su respuesta, a la vez y sin ver
  el otro. Valen ${HITS.map((h) => `"${h}"`).join(', ')}. En el anillo, en el
  sentido del reloj desde arriba: ${ANILLO_EN_PROSA}; "normal" va en el centro.
  El cruce fija el daño dentro de la horquilla del arma: con "normal" en
  cualquiera de los dos, el medio; si no, cuanto más lejos en el anillo, más
  daño (los dos iguales, el mínimo; opuestos, el máximo). La respuesta es
  además el tipo del contraataque, que cae en el punto contrario: quien acierta
  la respuesta recibe el mínimo y devuelve el máximo. Lo que hace cada tipo con
  el arma de tu unidad activa viene en "hits", cuando puede golpear. Sin "hit",
  tu golpe lo elige la IA a ciegas por ti; uno que no es de la lista descarta
  el "attack" como cualquier acción ilegal. Cuando el rival golpea a una unidad
  tuya, se te pide la respuesta con "battle_response". El registro cuenta cada
  cruce con el hecho "cruce" ("hit" de quien pegó, "response" de quien
  respondió). Tras golpear con "feint", el turno de esa unidad sigue solo para
  andar (o "end_turn"). El disparo no pasa por la rueda: sigue con su tirada.
- "power" usa un PODER de la unidad activa ("stacks[].powers": ${PODERES_EN_PROSA})
  sobre un aliado, incluida ella misma. Gasta su turno entero y solo sin haberse movido; los que
  puede usar ahora vienen en "legalActions".
- "cast" NO consume el turno de la unidad activa: lanza el héroe, se cobra el
  maná y una tirada por ronda, y después la unidad sigue pudiendo moverse,
  disparar o atacar. Se te volverá a pedir acción para el mismo stack.
- "wait" tampoco lo consume: manda a la unidad al FINAL de la cola de esta
  ronda y se te volverá a pedir acción para ella cuando hayan movido los
  demás. Sirve para no meterte en el alcance de quien todavía no ha actuado:
  déjale comprometerse y pégale tú después. Solo se puede una vez por ronda
  y por unidad, y por eso desaparece de "legalActions" en cuanto la usas.
- La lista "legalActions" de la petición ya trae TODAS las acciones legales;
  elegir una de ellas nunca falla.
- Si tu acción NO es legal se descarta y juega la IA de reglas en su lugar, que
  no es gratis: te habrá gastado el turno de esa unidad, o el maná de tu héroe
  si lo que jugó fue un hechizo. Se te dice cuál de las dos en el veredicto.
- De cada acción se te informa, también cuando entra: no tienes que deducir de
  un silencio si coló.`,

  battle_response: `Responde con:
{
  "response": "<golpe>",
  "reasoning": "una línea opcional"
}

El rival golpea cuerpo a cuerpo a una unidad tuya ("target", de "attacker") y
eliges tu RESPUESTA en la rueda del golpe, a la vez que él elige su golpe: NO
lo ves, ni aquí ni en el registro hasta que se cruzan. Valen
${HITS.map((h) => `"${h}"`).join(', ')}.

- El cruce fija el daño que recibes dentro de la horquilla de su arma: con
  "normal" en cualquiera de los dos, el medio; si no, cuanto más lejos esté tu
  respuesta de su golpe en el anillo (${ANILLO_EN_PROSA}, en el sentido del
  reloj desde arriba), más daño; la misma, el mínimo.
- Tu respuesta es también el tipo de tu contraataque, que cae en el punto
  contrario: si aciertas, recibes el mínimo y devuelves el máximo.
- "responses" trae, por cada tipo ("response"), el daño de cada golpe de tu
  contraataque ("counterDamage", de "min" a "max", y "strikes", cuántos golpes)
  y lo que hace ("effect"). Si
  tu unidad no devolverá el golpe, "noCounterattack" dice por qué y tu
  respuesta solo cuenta para el cruce.
- Una respuesta que no es de la lista, o ninguna a tiempo, no te quita la
  batalla: esa respuesta la elige la IA a ciegas por ti, se te dice en el
  veredicto y sigues jugando.`,

  map_generate: `Responde con:
{
  "plan": { ...plan de mapa declarativo... },
  "reasoning": "una línea opcional"
}

El plan NO es una imagen ni una rejilla: describe el mapa y el motor lo
construye. Campos: width, height, baseTerrain, patches[], regions[], walls[],
nodes[], towns[], villages[], monsters[], chests[], roads?, raiders?. No hay
posiciones de inicio: el héroe de cada jugador empieza DENTRO de su base. Ni
minas ni montones de recursos: el único recurso es el oro (un plan con "mines"
o "resources" se rechaza).

El mapa es una RED DE NODOS, y eso se comprueba:
- Una REGIÓN es una zona por la que se anda libre, cerrada por muro. Cada una se
  declara en "regions" con un "id", un "name" y una casilla suya en "at".
- Un MURO es un tramo RECTO de una barrera: ${BARRERAS.map((b) => `"${b}"`).join(', ')}
  (los de "palette.wallTerrains"). Las cinco cierran igual —ninguna se pisa—,
  pero son accidentes distintos y no da lo mismo cuál pongas: el río es "water",
  la cordillera "mountain", el bosque denso "forest", el acantilado o desnivel
  "cliff" y el muro o la ruina "wall". También sirven, dentro de una región,
  como obstáculos que se rodean, siempre que no la partan en dos.
  {"terrain", "from", "to"} con "from" y "to" en la misma fila o en la misma
  columna; se pintan los dos extremos y lo de en medio. Un tramo en diagonal se
  rechaza: deja huecos por las esquinas. Se mueve en 8 direcciones, así que dos
  casillas pisables que se tocan aunque sea en diagonal están unidas.
- Un NODO es el único paso entre regiones: una casilla de "nodes" en un muro,
  tocando dos regiones o más. Una CIUDAD ("towns") ES un nodo: va igual en el
  muro, entre regiones, y no se repite en "nodes". Un nodo o una ciudad ABRE la
  casilla de muro en la que está, así que puedes trazar el muro entero y poner
  el paso encima. El nodo cruza la barrera del muro que abre —sobre "water" es
  un puente—, y uno sin muro debajo se rechaza. Dos nodos no pueden ser vecinos.
- Quitando los nodos, cada zona pisable tiene que ser EXACTAMENTE una de tus
  regiones: si dos regiones se tocan sin nodo, se te dice entre qué dos casillas
  queda el paso abierto; una zona pisable sin región declarada se rechaza; cada
  región necesita al menos un nodo, y todas tienen que alcanzarse.
- Una región es de quien tenga TODOS sus nodos, y solo da renta unida a su base.
  Los pueblos ("villages": {"name", "at"}) no se toman: son de quien tenga su
  región, y por eso no llevan dueño. Cada uno ${REGLA_DEL_PUEBLO}.
- Una región puede llevar "terrain": su suelo ENTERO, todas sus casillas
  pisables pintadas de ese terreno (encima de "patches"). Tiene que ser un suelo
  que se pise, no una barrera. Solo pinta: no cambia por dónde se anda.
- Una región puede llevar "nivel": su ALTURA, ${NIVELES.join(', ')} (0 abajo, 1 el llano,
  2 la meseta). No cambia por dónde se anda ni lo que cuesta: es el relieve que
  se pinta. Cada barrera tiene que admitir los niveles de las regiones que toca:
  un acantilado ("cliff") es el borde de una meseta y va SOLO entre regiones a
  distinto nivel; "forest" y "wall" van SOLO entre regiones al mismo nivel;
  ${BARRERAS_DE_DESNIVEL.map((b) => `"${b}"`).join(', ')} valen entre dos niveles. Se mira por tramo de barrera
  seguido (las casillas de una misma barrera que se tocan, también en diagonal;
  un nodo o una ciudad lo corta), con todas las regiones que ese tramo toca: un acantilado que solo toca
  regiones a un nivel, o uno dentro de una sola región, se rechaza; un bosque o
  un muro que toque dos niveles, también, y se te dice cuál y por dónde pasa. Un
  nodo entre dos niveles es una rampa. Una región sin "nivel" va al 1. Si NO
  declaras ningún nivel, todo va al 1 y esto no se comprueba, pero tus
  acantilados se pintan como franjas de roca sin cara: si pones "cliff", declara
  los niveles.
- "patches" solo pintan el suelo (círculos de "terrain", "center" y "radius"): no
  separan nada. Los muros se pintan encima.
- Una ciudad neutral ("owner": null) nace con guarnición: hay que vencerla para
  tomarla. La base de cada jugador —su PRIMERA ciudad en "towns"— nace también
  con guarnición, de la facción de su dueño, y su héroe empieza dentro; sus
  otras ciudades nacen vacías.

Reglas que se validan antes de aceptarlo:
- Mínimo ${LADO_MINIMO_DEL_PLAN}×${LADO_MINIMO_DEL_PLAN}, máximo ${LADO_MAXIMO_DEL_PLAN}×${LADO_MAXIMO_DEL_PLAN}.
- Al menos dos ciudades, y cada jugador de "want.players" tiene al menos una
  ciudad: la primera suya es su base y su héroe empieza dentro, en la casilla de
  la ciudad, y sale por sus puertas.
- Dos cosas no pueden compartir casilla.
- Todo lo que no es nodo ni ciudad —pueblos, monstruos y cofres— va DENTRO de
  una región, nunca sobre un muro ni sobre un nodo.
- Cada ciudad es un RECINTO amurallado de ${LADO_DEL_RECINTO}×${LADO_DEL_RECINTO} casillas con ella en el
  medio. Por eso: una ciudad va a una casilla del borde del mapa o más; dos
  ciudades, a ${SEPARACION_DE_CIUDADES} casillas o más, contando la diagonal como una; y dentro de un
  recinto no va nada más que su ciudad —ni un nodo, ni otra ciudad, ni un
  pueblo, un monstruo, un cofre o un grupo de asaltantes—.
- A una ciudad se entra por las PUERTAS de su recinto, y el resto del recinto no
  se pisa. Las puertas posibles son seis, relativas a la ciudad en {x,y}: la
  del norte en {x,y-1}, con su acceso en {x,y-2}; la del sur en {x,y+1}, con el
  suyo en {x,y+2}; y las de las diagonales en las esquinas del recinto
  ({x±1,y±1}), cada una con sus tres casillas de fuera pegadas a ella (la del
  noreste, {x+1,y-1}, desde {x+1,y-2}, {x+2,y-2} o {x+2,y-1}). Ni al este ni al
  oeste. Y HAY PUERTA SOLO DONDE LLEGA UN CAMINO: un camino entra de un acceso a
  su puerta y de la puerta a la ciudad, y cada región que toca un acceso de una
  ciudad tiene que llevar su camino hasta ella por una de sus puertas, o el
  plan se rechaza. Un camino que cruza la muralla por otro sitio, también.
- Una ciudad junto a un río (una ciudad-puente) va en tierra, y a dos casillas,
  en cruz, deja una casilla del río que se pisa, con agua a sus dos lados a lo
  largo del río: es su puente, tierra de la orilla de enfrente y el acceso de su
  puerta del río, que existe siempre (también al este o al oeste). Una ciudad
  sobre el agua del río se rechaza. Lo que no cumpla todo esto se rechaza
  diciendo cuál y dónde.
- Un camino ("roads") solo va por casillas que se pisan —una región, un nodo o
  una ciudad, y las puertas de una ciudad aunque debajo haya barrera—. Uno
  sobre una barrera se rechaza diciendo la casilla: pintado encima de un
  acantilado diría que por ahí se pasa, y no se pasa.
- Desde cada base se debe poder llegar a pie a todas las ciudades.
- "monsters[].creature" tiene que ser un id de criatura que exista: usa los de
  "palette.creaturesForGuards", que están escritos como los espera el motor.
  Distingue mayúsculas ("zombi" sí, "Zombi" no) y no vale inventarse una:
  el mapa no se construye y se te devuelve la lista de las que valen.
- "monsters[].count" son individuos, un entero de 1 a 7: en batalla ningún
  bando lleva más de 7 (un héroe pelea con 6 más él). Un monstruo de más se
  rechaza diciendo el máximo.
- "raiders" es OPCIONAL: grupos de asaltantes de caminos con los que empieza la
  partida, {"at", "troops": [{"creature", "count"}, ...]}. Un plan sin ellos
  vale, y brotarán solos los lunes en las regiones sin dueño. Cada grupo
  patrulla la región en la que lo pones y embosca al héroe que la pise si le
  saca el margen de fuerza. Reglas: sus criaturas, como las de "monsters";
  entre todos sus grupos, de 1 a "palette.raiders.maxIndividuals" individuos;
  no más liderazgo que "palette.raiders.maxLeadership" ni más fuerza que
  "palette.raiders.maxStrength" —la fuerza es, sumada por individuo, el daño
  medio por los puntos de vida; los de "palette.raiders.examples" valen todos—.
  Y dónde: dentro de una región, a dos casillas o más de cualquier nodo o
  ciudad —pegado a uno taparía el paso— y en una región sin dueño. Sí puede ir
  en las regiones que tocan una base.
- Un "towns[].owner" tiene que ser uno de los jugadores de "want.players": ahí
  van sus números, así que no hay nada que deducir, y una ciudad de otro jugador
  se rechaza. Para dejar una ciudad neutral, "owner": null.
- Devuelve el "width" y el "height" que se te piden en "want": el servidor
  compara la partida con agente contra la que jugaría sin él, y un tamaño
  distinto las hace incomparables.
- El ORDEN en que escribas las ciudades no decide quién abre: el servidor ordena
  los jugadores por su número, así que el 0 abre la partida lo escribas donde lo
  escribas.
- El "id" de una ciudad o de una región es un identificador, no un rótulo:
  minúsculas, letras, dígitos, guion y guion bajo, empezando por letra o dígito,
  hasta 32 caracteres. "town-0" vale; "Pueblo Uno" no. Y no puede repetirse.
  "node-N" y "village-N" los reserva el motor para los nodos y los pueblos.
- El "name" es lo que lee una persona: una sola línea, sin saltos, caracteres
  de control ni marcas de dirección, sin empezar por un acento suelto, no en
  blanco, sin caracteres invisibles (salvo los que forman un emoji) ni de uso
  privado, hasta 40 caracteres.
Si el plan no vale, se juega el mapa del generador procedimental y te llega la
lista de problemas como aviso: no se te vuelve a pedir.`,

  hero_from_troop: `Responde con:
{
  "name": "el nombre del héroe",
  "story": "su historia, en una línea",
  "heroType": "<id de uno de heroTypes>",
  "reasoning": "una línea opcional"
}

Un individuo de tu tropa ha llegado al rango máximo y está en tu base: se hace
HÉROE, y lo creas tú a partir de lo que fue. "veteran" es quién era —su
criatura, su rango y su nivel, su experiencia, sus batallas, sus bajas y los héroes
rivales que derribó—, y "town" dónde está.

- "name": una sola línea, sin saltos, caracteres de control ni marcas de
  dirección, sin empezar por un acento suelto, no en blanco, sin caracteres
  invisibles (salvo los que forman un emoji) ni de uso privado, hasta 40
  caracteres.
- "story": lo mismo, hasta 280 caracteres. La ve quien juega en el panel del
  héroe.
- "heroType": el "id" de uno de "heroTypes", que son los de TU facción. Uno de
  otra facción o uno inventado se rechaza diciendo los que valen. El tipo
  todavía NO da ninguna habilidad: se guarda, se ve y se usará cuando exista.

El héroe nace en tu base con la experiencia del veterano (rango ${RANGO_MAXIMO_DE_TROPA} o más), las
cifras de un héroe contratado y SIN MOVIMIENTO hasta mañana. El veterano deja
de estar donde estaba. Si nace en la casilla del castillo, se lleva la
guarnición que le quepa, como uno contratado; si la casilla la ocupa otro
héroe tuyo —el que llevaba al veterano, por ejemplo—, nace al lado sin tropa y
la guarnición se la lleva el del castillo, que es quien la defiende. Si tu respuesta no vale —o no llega—, no
pasa nada: la tropa sigue igual y no se te vuelve a preguntar por él hasta que
salga de la base y vuelva.`,

  town_voices: `Responde con:
{
  "voices": [
    { "town": "<id de la base>", "npc": "<id de la persona>", "lines": ["una línea", "otra"] }
  ],
  "reasoning": "una línea opcional"
}

Pon voz a la gente de tus bases. "towns" trae cada base tuya cuyas voces hay que
rehacer (empezó semana o se levantó algo en un sitio vacío, que trae un
encargado nuevo): sus edificios, su héroe, su
guarnición y su gente en "npcs", con su "id", su nombre ("name"), su papel
("role"), el edificio que atiende si es encargado ("building") y lo que dice
ahora ("current"). "recentEvents" es lo último que te consta, para que hablen de
lo que ha pasado.

- De 1 a ${LINEAS_POR_VECINO} líneas por persona; se dice una cada día, por turno. Una línea es
  lo mismo que el nombre de un héroe —una sola línea, sin saltos, caracteres de
  control ni marcas de dirección, sin empezar por un acento suelto, no en
  blanco, sin caracteres invisibles (salvo los que forman un emoji) ni de uso
  privado— y hasta ${LARGO_DE_LINEA} caracteres.
- Hasta ${MAX_VOCES_POR_RESPUESTA} voces en total. No hace falta darle voz a todo el mundo: quien
  no la tenga dice sus frases de siempre.
- Es PRESENTACIÓN, nunca reglas: lo que digan no cambia nada del juego, así que
  no prometas cifras, precios ni efectos.
- Cada voz se juzga sola, y cada línea dentro de ella también: una persona que
  no está en esa base, o una línea que no vale, se rechaza diciendo por qué, sin
  tirar las demás. Lo que pasa con lo rechazado: esa persona dice sus frases de
  siempre.
- Si no respondes, o la respuesta no encaja, todos dicen sus frases de siempre y
  no se te vuelve a preguntar por esas bases hasta la semana que viene o hasta
  que se levante algo en un sitio vacío. No detiene tu turno: tu
  "adventure_turn" llega después igual.`,
};
