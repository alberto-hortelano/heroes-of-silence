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

export const terrainSchema = z.enum([
  'grass',
  'dirt',
  'sand',
  'snow',
  'swamp',
  'lava',
  'rough',
  'water',
]);

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
      id: z.string(),
      name: z.string(),
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

export const banterResponseSchema = z.object({
  line: z.string().max(280),
});

// ---------------------------------------------------------------- peticiones

export const REQUEST_KINDS = [
  'adventure_turn',
  'battle_turn',
  'map_generate',
  'hero_banter',
] as const;

export type RequestKind = (typeof REQUEST_KINDS)[number];

export const responseSchemas = {
  adventure_turn: adventureTurnResponseSchema,
  battle_turn: battleTurnResponseSchema,
  map_generate: mapGenerateResponseSchema,
  hero_banter: banterResponseSchema,
} as const;

export type AdventureTurnResponse = z.infer<typeof adventureTurnResponseSchema>;
export type BattleTurnResponse = z.infer<typeof battleTurnResponseSchema>;
export type MapGenerateResponse = z.infer<typeof mapGenerateResponseSchema>;
export type BanterResponse = z.infer<typeof banterResponseSchema>;

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
- "towns[].teaches" son los hechizos que enseña el gremio de ese pueblo: un
  héroe tuyo parado allí los aprende solo, hasta donde le deje su Sabiduría, y
  aparecen en "heroes[].spells". NO hay acción para aprender: basta con llevarlo.
- "knownMap.objects" es lo que has OBSERVADO, no lo que es verdad ahora: cada
  objeto trae "lastSeen" con el día en que lo viste. Si "lastSeen" es anterior
  a hoy, el dato puede haber caducado —una mina cambia de dueño y tú sigues
  viendo la bandera vieja hasta que alguien vuelva a mirar—. Una mina tuya que
  dejó de dar recursos es la señal de que allí ha pasado algo.
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
- Dos objetos no pueden compartir casilla.
- Desde cada inicio se debe poder llegar a pie a todos los pueblos.
Si algo falla se te devuelve la lista de problemas para que lo corrijas.`,

  hero_banter: `Responde con:
{ "line": "una frase corta, en español, en boca del héroe" }`,
};
