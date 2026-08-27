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
import { TERRAIN_KINDS } from '../map/terrain.js';
import { COMO_SE_LEE_EL_MAPA } from './serialize.js';

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
  z.object({ type: z.literal('end_turn') }),
]);

export const battleActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('move'), to: hexSchema }),
  z.object({ type: z.literal('attack'), target: z.string(), from: hexSchema.optional() }),
  z.object({ type: z.literal('shoot'), target: z.string() }),
  z.object({ type: z.literal('wait') }),
  z.object({ type: z.literal('defend') }),
  z.object({ type: z.literal('cast'), spell: z.string(), target: z.string().optional() }),
]);

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

export const resourceSchema = z.enum([
  'wood',
  'mercury',
  'ore',
  'sulfur',
  'crystal',
  'gems',
  'gold',
]);

export const mapPlanSchema = z.object({
  width: z.number().int().min(8).max(128),
  height: z.number().int().min(8).max(128),
  baseTerrain: terrainSchema,
  regions: z.array(
    z.object({ terrain: terrainSchema, center: pointSchema, radius: z.number().min(1).max(40) }),
  ),
  towns: z.array(
    z.object({
      // El `id` y el `name` de un pueblo son los dos únicos textos del plan que
      // el motor usa VERBATIM: `buildMap` los mete tal cual en el `MapObject` y
      // en el `Town`, y de ahí salen por la consulta `map`, por `game_state` y
      // por el canal del espectador. Antes eran `z.string()` a secas, o sea
      // cualquier cosa de cualquier longitud, y una `id` con un salto de línea
      // dentro se lleva por delante el bloque de veredictos, que se parsea línea
      // a línea (`notas.ts`). Esto es un **contrato acotado** y NO es defensa
      // contra XSS: la pantalla mete el nombre sin escapar en `innerHTML`
      // (`panels.ts`), y eso es #63, que hay que cerrar antes de que un visor
      // enseñe la partida del servidor.
      id: z
        .string()
        .min(1)
        .max(32)
        .regex(
          /^[a-z0-9][a-z0-9_-]*$/,
          'un id de pueblo va en minúsculas y solo lleva letras, dígitos, guion y guion bajo, empezando por letra o dígito (p. ej. "town-0")',
        ),
      name: z
        .string()
        .min(1)
        .max(40)
        .regex(/^[^\n\r]+$/, 'el nombre de un pueblo es una sola línea, sin saltos'),
      faction: z.enum(['knight', 'necromancer']),
      at: pointSchema,
      owner: z.number().int().nullable(),
    }),
  ),
  heroStarts: z.array(z.object({ player: z.number().int(), at: pointSchema })),
  mines: z.array(
    z.object({ at: pointSchema, resource: resourceSchema, owner: z.number().int().optional() }),
  ),
  resources: z.array(
    z.object({ at: pointSchema, resource: resourceSchema, amount: z.number().int().positive() }),
  ),
  monsters: z.array(
    z.object({ at: pointSchema, creature: z.string(), count: z.number().int().positive() }),
  ),
  chests: z.array(z.object({ at: pointSchema, gold: z.number().int().positive() })),
  roads: z.array(pointSchema).optional(),
});

export const mapGenerateResponseSchema = z.object({
  plan: mapPlanSchema,
  reasoning: z.string().max(2000).optional(),
});

// ---------------------------------------------------------------- peticiones

export const REQUEST_KINDS = ['adventure_turn', 'battle_turn', 'map_generate'] as const;

export type RequestKind = (typeof REQUEST_KINDS)[number];

export const responseSchemas = {
  adventure_turn: adventureTurnResponseSchema,
  battle_turn: battleTurnResponseSchema,
  map_generate: mapGenerateResponseSchema,
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
  { "type": "hire_hero", "town": "<id>" }
  { "type": "end_turn" }

Notas:
- "to" puede estar a varios días de marcha: el héroe avanza lo que le dé el día.
- Mover a la casilla de un monstruo, de un héroe enemigo o de un castillo
  defendido inicia una batalla, y esa batalla la juegas tú con "battle_turn".
- "heroes[].level" sube cuando el héroe acumula experiencia ganando batallas, y
  se cobra también defendiendo. Hoy es una medida de veteranía y no reparte
  atributos todavía; sirve para saber qué héroe tuyo lleva el peso de la guerra.
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
- Si una acción resulta ilegal se descarta y las siguientes siguen aplicándose.
- Al cerrar el turno se te dice cuántas acciones entraron y, si se descartó
  alguna, cuál y por qué. Las descartadas NO se reintentan solas.`,

  battle_turn: `Responde con:
{
  "action": { ...una sola acción... },
  "reasoning": "una línea opcional"
}

Mira "yourSide": puedes ser el atacante o el defensor. Cuando el rival te ataca
un héroe o un castillo, esta batalla la juegas defendiendo, y "stacks" con ese
"side" son los tuyos.

Acciones válidas para la unidad activa:
  { "type": "move",   "to": { "col": N, "row": N } }
  { "type": "attack", "target": "<id de stack>", "from": { "col": N, "row": N } }
  { "type": "shoot",  "target": "<id de stack>" }
  { "type": "wait" }
  { "type": "defend" }
  { "type": "cast",   "spell": "<id>", "target": "<id de stack>" }

Notas:
- "from" es opcional en "attack": si se indica, la unidad se mueve ahí y golpea.
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

  map_generate: `Responde con:
{
  "plan": { ...plan de mapa declarativo... },
  "reasoning": "una línea opcional"
}

El plan NO es una imagen ni una rejilla: describe el mapa y el motor lo
construye. Campos: width, height, baseTerrain, regions[], towns[], heroStarts[],
mines[], resources[], monsters[], chests[], roads?.

Reglas que se validan antes de aceptarlo:
- Mínimo 8×8, máximo 128×128.
- Al menos dos pueblos y dos posiciones de inicio, y cada jugador con un pueblo.
- Dos objetos no pueden compartir casilla, y las posiciones de inicio TAMBIÉN
  ocupan la suya: dos héroes juntos, o un héroe encima de un castillo, se
  rechazan.
- Desde cada inicio se debe poder llegar a pie a todos los pueblos.
- "monsters[].creature" tiene que ser un id de criatura que exista: usa los de
  "palette.creaturesForGuards", que están escritos como los espera el motor.
  Distingue mayúsculas ("skeleton" sí, "Skeleton" no) y no vale inventarse una:
  el mapa no se construye y se te devuelve la lista de las que valen.
- Un "towns[].owner" y un "mines[].owner" tienen que ser jugadores CON posición
  de inicio en este mismo plan. Para dejar un pueblo neutral, "owner": null;
  para una mina sin dueño, no pongas "owner".
- Devuelve el "width" y el "height" que se te piden en "want": el servidor
  compara la partida con agente contra la que jugaría sin él, y un tamaño
  distinto las hace incomparables.
- El ORDEN en que escribas "heroStarts" no decide nada: el servidor ordena los
  jugadores por su número, así que el 0 abre la partida lo escribas donde lo
  escribas.
- El "id" de un pueblo es un identificador, no un rótulo: minúsculas, letras,
  dígitos, guion y guion bajo, empezando por letra o dígito, hasta 32
  caracteres. "town-0" vale; "Pueblo Uno" no. Y no puede repetirse: dos pueblos
  con el mismo id son dos castillos indistinguibles para todo lo demás.
- El "name" es lo que lee una persona: una sola línea, sin saltos, hasta 40
  caracteres.
- "heroStarts" tiene que traer EXACTAMENTE los jugadores de "want.players", uno
  por jugador: ahí van sus números, así que no hay nada que deducir. Sin repetir
  ninguno y sin inventarte un tercero. Un inicio de más deja dos héroes con el
  mismo id; un jugador sin inicio se queda sin héroe y sin turnos.
Si algo falla se te devuelve la lista de problemas para que lo corrijas.`,
};
