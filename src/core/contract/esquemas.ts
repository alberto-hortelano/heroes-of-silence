/**
 * Los esquemas (zod) de lo que responde el agente: las acciones de aventura y de
 * batalla, el plan de mapa, el ascenso de un veterano y las voces de la base, y qué
 * peticiones hay (`REQUEST_KINDS`, `responseSchemas`). Todo lo que llega del agente
 * se valida con ellos ANTES de tocar el estado, y una respuesta mal formada se
 * rechaza diciendo qué falta.
 *
 * Vivían con el formato de las respuestas en `agent.ts`, que se partió en la fase N
 * de la reorganización (07-11-2026): la prosa que se le embebe al agente, en
 * `formato.ts`; lo que se valida, aquí.
 */
import { z } from 'zod';
import { LINEAS_POR_VECINO, MAX_VOCES_POR_RESPUESTA } from '../gente/voces.js';
import { lineaLegible } from '../linea.js';
import { LADO_MAXIMO_DEL_PLAN, LADO_MINIMO_DEL_PLAN } from '../map/generar/plan.js';
import { BARRERAS, esNivel, QUE_ES_UN_NIVEL, TERRAIN_KINDS } from '../map/terrain.js';
import { FACTION_IDS } from '../types.js';
import { ID_DE_MAPA } from '../validar.js';
import { JUGADA_DE_MURALLA } from './vocabulario.js';

// ---------------------------------------------------------------- respuestas

const pointSchema = z.object({ x: z.number().int(), y: z.number().int() });
const hexSchema = z.object({ col: z.number().int(), row: z.number().int() });

/** Una puerta de la muralla: el lado entre dos casillas de una fila, `b` al este de `a`. */
const gateSchema = z.object({ a: hexSchema, b: hexSchema });

/**
 * Las jugadas de aventura. **El zod juzga la forma, no el valor** (#317,
 * 11-11-2026; la regla, «Forma y valor» en `docs/areas/agente.md`): una
 * respuesta sin forma —un `type` que no existe, un campo que falta o con otro
 * tipo JSON, una casilla con decimales, más letras o líneas de las que caben— se
 * lleva el turno entero; un valor que no vale —un `count` de 0 o de 1,5, un id,
 * un hueco o una obra mal escritos— descarta solo esa jugada con su motivo
 * (`accionDelAgente` o el `*Blocker` del núcleo), y las siguientes siguen. Por eso
 * `count`, `slot` y `upgrade` son número y texto sueltos, no `.int().positive()`
 * ni `z.enum`. El tipo de lo que sale de aquí es `AccionDelAgente`
 * (`vocabulario.ts`, `z.infer`).
 */
export const adventureActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('move_hero'), hero: z.string(), to: pointSchema }),
  z.object({ type: z.literal('hire_hero'), town: z.string() }),
  z.object({ type: z.literal('build'), town: z.string(), building: z.string() }),
  z.object({
    type: z.literal('recruit'),
    town: z.string(),
    creature: z.string(),
    count: z.number(),
  }),
  z.object({
    type: z.literal('dismiss'),
    hero: z.string(),
    creature: z.string(),
    count: z.number(),
  }),
  // Dejar y recoger tropa en la guarnición del sitio tuyo donde está el héroe
  // (04-11-2026): la misma forma, un miembro con las dos palabras.
  z.object({
    type: z.enum(['leave_troops', 'take_troops']),
    hero: z.string(),
    creature: z.string(),
    count: z.number(),
    veteran: z.string().optional(),
  }),
  // Repartir de una vez la tropa entre el héroe y la guarnición (10-11-2026):
  // `withHero` es todo lo que va con él. Cada línea, `creature` y `count`, o
  // `veteran`: todo opcional aquí; una línea que no dice a quién la juzga
  // `accionDelAgente` (QA, H2), y el reparto, `repartirTropaBlocker`.
  z.object({
    type: z.literal('distribute_troops'),
    hero: z.string(),
    withHero: z
      .array(
        z.object({
          creature: z.string().optional(),
          count: z.number().optional(),
          veteran: z.string().optional(),
        }),
      )
      .max(32),
  }),
  // Hacer la obra del puesto donde está el héroe (10-11-2026).
  z.object({ type: z.literal('upgrade_outpost'), hero: z.string(), upgrade: z.string().max(32) }),
  z.object({ type: z.literal('buy_item'), town: z.string(), item: z.string() }),
  z.object({
    type: z.literal('equip'),
    hero: z.string(),
    item: z.string(),
    veteran: z.string().optional(),
    creature: z.string().optional(),
    // En qué hueco, como en `unequip`; sin él, el de la pieza. Un arma va también
    // en el de la segunda (25-10-2026).
    slot: z.string().max(32).optional(),
  }),
  z.object({
    type: z.literal('unequip'),
    hero: z.string(),
    slot: z.string(),
    veteran: z.string().optional(),
  }),
  z.object({ type: z.literal('end_turn') }),
]);

/**
 * Una jugada que ya no existe: su `type` no vale nunca, con la frase que dice qué
 * mandar. Es **forma** («Forma y valor», `docs/areas/agente.md`): el zod la
 * rechaza, esa jugada la juega la IA y la batalla sigue siendo del agente (#334).
 *
 * El `refine` es un predicado que estrecha a `never` (#338, 11-11-2026): el zod
 * la sigue rechazando con su frase, y `z.infer` la deja fuera del tipo
 * (`AccionDeBatallaDelAgente`, `{ type: never }`, que nada habita). Con un
 * `refine(() => false)` a secas el tipo seguía diciendo `{ type: 'wait' }`, y por
 * eso el tipo iba a mano y el director lo ataba con un `as`.
 */
function retirada<T extends string>(type: T, verbo: string) {
  return z.object({
    type: z.literal(type).refine((_t): _t is never => false, {
      message: `ya no hay "${type}": ${verbo} se retiró de la batalla; para cerrar el turno de la unidad sin hacer nada, manda { "type": "end_turn" }`,
    }),
  });
}

/**
 * La jugada de un turno de batalla. **El zod juzga la forma** (#334, 11-11-2026;
 * «Forma y valor» en `docs/areas/agente.md`): el `type`, los campos, las casillas
 * enteras, `surrender.gold` entero y no negativo, las retiradas. Una respuesta sin
 * ella cuesta solo esa jugada, que juega la IA, como una sin valor (`hit`, los
 * `*Blocker`): la respuesta es una sola jugada y lo siguiente es el próximo
 * `battle_turn` de la misma batalla. Su tipo es `AccionDeBatallaDelAgente`.
 */
export const battleActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('move'), to: hexSchema }),
  // `hit`, el golpe de la rueda, va como texto y no como `z.enum`: los golpes que
  // valen dependen de la rueda de cada batalla (`golpeDelHit`, en el director), así
  // que es valor, no forma, y uno mal escrito se dice con su motivo. Sin él, lo
  // elige la IA a ciegas por ti.
  z.object({
    type: z.literal('attack'),
    target: z.string(),
    from: hexSchema.optional(),
    hit: z.string().max(32).optional(),
  }),
  // El disparo diferido (25-10-2026): apuntar a una casilla cierra el turno y el
  // disparo sale al empezar el siguiente (`apuntarBlocker`, `lineaDelDisparo`).
  z.object({ type: z.literal('aim'), at: hexSchema }),
  // La granada (02-11-2026): lanzarla a una casilla a su alcance cierra el turno y
  // explota al empezar el siguiente (`lanzarBlocker`, `explosionDe`).
  z.object({ type: z.literal('throw'), at: hexSchema }),
  // Retiradas el 26-10-2026 (decisión del usuario): se rechazan diciéndolo y
  // diciendo qué mandar, en vez de un «discriminador inválido» que no explica
  // nada. La batalla sigue: esa jugada la juega la IA en su lugar, como cualquier
  // otra sin forma (#334, 11-11-2026; hasta entonces se llevaban la batalla entera).
  retirada('wait', 'esperar'),
  retirada('defend', 'defenderse'),
  // El hechizo del héroe: a una unidad (`target`), a una casilla (`at`) o, sobre sí o
  // el tablero, a nada (el editor de magia, 06-11-2026).
  z.object({
    type: z.literal('cast'),
    spell: z.string(),
    target: z.string().optional(),
    at: hexSchema.optional(),
  }),
  // El poder de la unidad activa (`UnitInfo.poderes`, un hechizo suyo): el turno entero.
  z.object({
    type: z.literal('power'),
    power: z.string(),
    target: z.string().optional(),
    at: hexSchema.optional(),
  }),
  // `gold` es opcional: viene puesto en `legalActions` y devolverla tal cual
  // vale; si se manda, tiene que ser el precio de ahora (`applyAction`).
  z.object({ type: z.literal('surrender'), gold: z.number().int().nonnegative().optional() }),
  z.object({ type: z.literal('end_turn') }),
  // La muralla (fase 2 del puesto fronterizo, 04-11-2026): toda batalla contra
  // una ciudad o un pueblo la lleva. El núcleo las nombra en español
  // (`JUGADA_DE_MURALLA`); el agente, así. Cada una se juzga con su `*Blocker`.
  z.object({ type: z.literal(JUGADA_DE_MURALLA.poner_escalera), wall: hexSchema }),
  z.object({ type: z.literal(JUGADA_DE_MURALLA.subir), wall: hexSchema }),
  z.object({ type: z.literal(JUGADA_DE_MURALLA.abrir_puerta), gate: gateSchema }),
  z.object({ type: z.literal(JUGADA_DE_MURALLA.cerrar_puerta), gate: gateSchema }),
]);

/**
 * La respuesta de la rueda cuando golpean a una unidad del agente
 * (`battle_response`). Texto y no `z.enum`, por lo mismo que `hit`: una que no
 * es un golpe se dice en el veredicto y la elige la IA a ciegas por él, sin
 * quitarle la batalla.
 */
const battleResponseResponseSchema = z.object({
  response: z.string().max(32),
  reasoning: z.string().max(2000).optional(),
});

const adventureTurnResponseSchema = z.object({
  /** Acciones en orden. No hace falta terminar con `end_turn`: se añade solo. */
  actions: z.array(adventureActionSchema).max(200),
  /**
   * Opcional: el clima que el narrador pide por región (`pedirClima`). **Sin
   * tipar aquí**: lo juzga entrada a entrada `climaBlocker`, y una mal escrita
   * (un tiempo de 18 letras, `days: 1.5`, `night: "si"`, una entrada de más)
   * descarta ese pedido con su motivo, no el turno: con los tipos y los topes en
   * el esquema, la respuesta entera fallaba y el turno lo jugaba la IA (H1 del
   * QA del clima, 22-10-2026). La forma la dice la prosa (CLIMA).
   */
  weather: z.unknown().optional(),
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
const terrainSchema = z.enum(TERRAIN_KINDS);

/**
 * Un id que el motor usa VERBATIM —en el `MapObject`, en el `Town`, en los
 * mensajes y en la consulta `map`—, así que es un contrato acotado: una `id`
 * con un salto de línea dentro se llevaba por delante el bloque de veredictos,
 * que se parsea línea a línea (`server/mcp/escucha.ts`). NO es defensa contra XSS: eso es
 * `html.ts`.
 */
const idDeMapa = (que: string) =>
  z
    .string()
    .min(1)
    .max(32)
    .regex(
      ID_DE_MAPA,
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

const mapGenerateResponseSchema = z.object({
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
const townVoicesResponseSchema = z.object({
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
