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
import { CARGA_MINIMA } from '../battle/battle.js';
import { CHARGE_BONUS_PER_HEX, MAX_CHARGE_HEXES } from '../battle/damage.js';
import { NIVEL_MAXIMO_DE_TROPA } from '../hero/experiencia.js';
import { BARRERAS, TERRAIN_KINDS } from '../map/terrain.js';
import { MAX_HEROES_PER_PLAYER } from '../state/game.js';
import { HUECOS } from '../types.js';
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
  z.object({ type: z.literal('attack'), target: z.string(), from: hexSchema.optional() }),
  z.object({ type: z.literal('shoot'), target: z.string() }),
  z.object({ type: z.literal('wait') }),
  z.object({ type: z.literal('defend') }),
  z.object({ type: z.literal('cast'), spell: z.string(), target: z.string().optional() }),
  // `gold` es opcional: viene puesto en `legalActions` y devolverla tal cual
  // vale; si se manda, tiene que ser el precio de ahora (`applyAction`).
  z.object({ type: z.literal('surrender'), gold: z.number().int().nonnegative().optional() }),
  z.object({ type: z.literal('end_turn') }),
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
/**
 * Lo que lee una persona: una sola línea **y que se lea**. Sin caracteres de
 * control —el salto parte el bloque de veredictos, que se lee línea a línea, y
 * un `\u0000` o un tabulador no los pinta nadie— y con al menos un carácter
 * visible: QA encontró que `"   "` pasaba, y daba un héroe sin nombre en el
 * panel, la crónica y el veredicto. «Visible» descuenta también los de formato
 * (`\p{Cf}`, el espacio de anchura cero), que `trim()` no quita.
 *
 * #128 cerró lo que aún se colaba, en tres preguntas separadas porque cada una
 * tiene su motivo:
 * - **Una línea** descarta también U+2028/U+2029 (`\p{Zl}`, `\p{Zp}`), que no
 *   son `\p{Cc}` pero parten la línea igual, y los controles de dirección
 *   (`\p{Bidi_Control}`: el RLO U+202E da la vuelta a lo que viene detrás, en
 *   el veredicto también).
 * - **Algo que se lea** descarta lo que se pinta en blanco sin ser espacio: el
 *   braille vacío U+2800, los rellenos coreanos U+3164, U+FFA0 y U+115F
 *   (`\p{Default_Ignorable_Code_Point}`) y las marcas combinantes. Lo ignorable
 *   va SOLO aquí: incluye el selector de variante U+FE0F de ❤️ y el ZWJ U+200D
 *   de 👨‍👩‍👧, que dentro de un texto son legítimos; prohibirlos en la primera
 *   regla rompería los emojis compuestos.
 * - **Sin empezar por una marca**: un acento combinante suelto al principio se
 *   pega a lo que haya antes en la línea donde se pinte.
 * - **Caracteres que existen** (QA de #128): ni uso privado, ni sin asignar, ni
 *   no-caracteres, ni sustitutos sueltos. `\p{Cn}` sigue la versión de Unicode
 *   del motor: un emoji más nuevo que el Node del servidor se rechazaría.
 *
 * Es la puerta de todos los textos libres que el agente escribe para una persona
 * —los nombres del plan de mapa (#97) y el nombre y la historia del héroe
 * nacido—, así que un hueco que se cierra aquí se cierra en todos.
 */
const lineaLegible = (max: number, sujeto: string) =>
  z
    .string()
    .min(1)
    .max(max)
    .regex(
      /^[^\p{Cc}\p{Zl}\p{Zp}\p{Bidi_Control}]+$/u,
      `${sujeto} es una sola línea, sin saltos, caracteres de control ni marcas de dirección`,
    )
    .regex(
      // `\p{Cf}` no sobra al lado de lo ignorable: hay `Cf` que no son
      // ignorables y tampoco se leen, como U+0600–0605 y U+06DD.
      /[^\s\p{Cc}\p{Cf}\p{M}\p{Default_Ignorable_Code_Point}\u2800]/u,
      `${sujeto} no puede ir en blanco: tiene que llevar algo que se lea`,
    )
    .regex(/^\P{M}/u, `${sujeto} no puede empezar por un acento o una marca suelta`)
    .regex(
      // Uso privado (`Co`), sin asignar y no-caracteres (`Cn`: U+0378, U+FFFF,
      // U+FDD0) y sustitutos sueltos (`Cs`): no son nada que se lea, y cada
      // pantalla pinta otra cosa —una caja, un hueco, un glifo de una fuente
      // privada—. Las etiquetas de la bandera de Escocia (U+E0020–E007F) son
      // `Cf`, no `Co`, y siguen pasando.
      /^[^\p{Co}\p{Cn}\p{Cs}]+$/u,
      `${sujeto} solo puede llevar caracteres que existen: nada de uso privado, sin asignar ni sustitutos sueltos`,
    );
const nombreDeMapa = (que: string) => lineaLegible(40, `el nombre de ${que}`);

export const mapPlanSchema = z.object({
  width: z.number().int().min(8).max(128),
  height: z.number().int().min(8).max(128),
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
      faction: z.enum(['knight', 'necromancer']),
      at: pointSchema,
      owner: z.number().int().nullable(),
    }),
  ),
  heroStarts: z.array(z.object({ player: z.number().int(), at: pointSchema })),
  mines: z.array(z.object({ at: pointSchema, resource: resourceSchema })),
  villages: z.array(z.object({ name: nombreDeMapa('un pueblo'), at: pointSchema })),
  resources: z.array(
    z.object({ at: pointSchema, resource: resourceSchema, amount: z.number().int().positive() }),
  ),
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

// ---------------------------------------------------------------- peticiones

export const REQUEST_KINDS = [
  'adventure_turn',
  'battle_turn',
  'map_generate',
  'hero_from_troop',
] as const;

export type RequestKind = (typeof REQUEST_KINDS)[number];

export const responseSchemas = {
  adventure_turn: adventureTurnResponseSchema,
  battle_turn: battleTurnResponseSchema,
  map_generate: mapGenerateResponseSchema,
  hero_from_troop: heroFromTroopResponseSchema,
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

/** El bono de una casilla de carga en tanto por ciento, tal y como se le dice al agente. */
const PORCIENTO_POR_CASILLA_DE_CARGA = Math.round(CHARGE_BONUS_PER_HEX * 100);

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
  { "type": "unequip",   "hero": "<id>", "slot": "${HUECOS.join('" | "')}" }
  { "type": "unequip",   "hero": "<id>", "slot": "<hueco>", "veteran": "<id de veterano>" }
  { "type": "hire_hero", "town": "<id>" }
  { "type": "end_turn" }

Notas:
- "to" puede estar a varios días de marcha: el héroe avanza lo que le dé el día.
- Mover a la casilla de un monstruo, de un héroe enemigo, de un grupo de
  asaltantes o de un castillo defendido inicia una batalla, y esa batalla la
  juegas tú con "battle_turn".
- Cuidado con los ASALTANTES ("knownMap.raiders"): pisar la región de un grupo
  que te saca el margen de fuerza es una EMBOSCADA. El héroe se para en esa
  casilla aunque le queden puntos, y la batalla la juegas defendiendo. Si va
  directo a por la base rival por regiones sin conquistar, puede llegar con
  menos gente de la que salió —o no llegar—.
- La EXPERIENCIA se gana por daño: quien quita PV a un enemigo —criatura o
  héroe, con golpes, disparos o hechizos— gana "PV quitados × nivel del que los
  recibe", gane o pierda la batalla. La escala de niveles es UNA para tropa y
  héroe: la TROPA va del 1 al 5, y todo HÉROE empieza en el 5 —el inicial y el
  contratado— y sube sin tope (6, 7, 8…). "heroes[].level" lleva al lado su
  "experience" y "nextLevelAt"; cada nivel por encima del 5 le da LIDERAZGO (el
  tope de su ejército) y cuerpo. Pegarle a un héroe da mucho: recibe con su
  nivel, 5 o más. Una fila de "army" con "level" es UN veterano, con su
  "experience" y "nextLevelAt" (null en el 5); cada nivel le suma ataque y
  defensa. Si muere, se pierde con lo que había ganado.
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
- EQUIPO: todo héroe y todo individuo de la tropa tiene tres huecos
  (${HUECOS.join(', ')}) y en cada uno lleva una pieza o nada; cada pieza suma
  sus cifras a quien la lleva.
  "heroes[].equipment" es lo que lleva puesto el héroe (por hueco, el id o null) y
  "heroes[].backpack" su MOCHILA, las piezas que lleva sin poner. Todo héroe nace
  con el equipo de calidad de armería puesto en los tres huecos; solo mejora con
  piezas especiales. De dónde salen las piezas:
  · BOTÍN: vencer a un grupo de asaltantes —atacándolo o repeliendo su
    emboscada— o tomar una ciudad NEUTRAL con guarnición deja una pieza común o
    especial, al azar, en la mochila del héroe que gana. Lo cuenta "recentEvents"
    con "loot_found".
  · ARMERÍA: en un castillo tuyo con el edificio "armory" y un héroe tuyo dentro,
    "buy_item" compra una pieza de calidad de armería para su mochila;
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
- Cada héroe trae su "type", el TIPO de héroe (un id de los de su facción), y
  el que nació de la tropa trae además su "story". El tipo todavía NO da
  ninguna habilidad: se guarda y se ve.
- Un VETERANO de nivel ${NIVEL_MAXIMO_DE_TROPA} —el tope de la tropa— que esté en tu base al empezar
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

Acciones válidas para la unidad activa:
  { "type": "move",   "to": { "col": N, "row": N } }
  { "type": "attack", "target": "<id de stack>", "from": { "col": N, "row": N } }
  { "type": "shoot",  "target": "<id de stack>" }
  { "type": "wait" }
  { "type": "defend" }
  { "type": "cast",   "spell": "<id>", "target": "<id de stack>" }
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
- Un stack con "veteranLevel" es un VETERANO (nivel 2 a 5): su ataque y su
  defensa ya traen lo que da su nivel. Cada PV que le quites a alguien te da
  "PV × nivel de quien los recibe" de experiencia, así que pegar a un veterano o
  a un héroe enseña más. La tropa que muere pierde lo que había ganado.
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
- La CARGA es solo de las unidades con el rasgo "charge": un "attack" con "from"
  carga si ese "from" está en LÍNEA RECTA desde donde está la unidad ahora (una
  de las 6 rectas del hexágono, sin giros ni unidades en medio), a ${CARGA_MINIMA} casillas o
  más, y el "target" está EN ESA RECTA: la casilla que sigue a "from" es suya.
  Llegar a la recta y girar para pegar al de al lado no carga, ni pegar al que
  ya tienes pegado. Cada casilla suma un ${PORCIENTO_POR_CASILLA_DE_CARGA} % de daño, hasta ${MAX_CHARGE_HEXES}. Lo andado en
  tramos anteriores no cuenta: cada tramo se vuelve a medir. "chargeFrom" te
  lista las cargas que tienes ahora mismo: contra qué "target", desde qué
  casilla ("col", "row") y con cuántas casillas cobrarías ("hexes"); solo viene
  cuando hay alguna. Un "move" a esa casilla NO carga: solo mueve.
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
construye. Campos: width, height, baseTerrain, patches[], regions[], walls[],
nodes[], towns[], heroStarts[], mines[], villages[], resources[], monsters[],
chests[], roads?, raiders?.

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
  el paso encima. Dos nodos no pueden ser vecinos.
- Quitando los nodos, cada zona pisable tiene que ser EXACTAMENTE una de tus
  regiones: si dos regiones se tocan sin nodo, se te dice entre qué dos casillas
  queda el paso abierto; una zona pisable sin región declarada se rechaza; cada
  región necesita al menos un nodo, y todas tienen que alcanzarse.
- Una región es de quien tenga TODOS sus nodos, y solo da renta unida a su base.
  Las minas y los pueblos ("villages": {"name", "at"}) no se toman: son de quien
  tenga su región, y por eso no llevan dueño.
- Una región puede llevar "terrain": su suelo ENTERO, todas sus casillas
  pisables pintadas de ese terreno (encima de "patches"). Tiene que ser un suelo
  que se pise, no una barrera. Solo pinta: no cambia por dónde se anda.
- "patches" solo pintan el suelo (círculos de "terrain", "center" y "radius"): no
  separan nada. Los muros se pintan encima.
- Una ciudad neutral ("owner": null) nace con guarnición: hay que vencerla para
  tomarla. La base de cada jugador —su PRIMERA ciudad en "towns"— nace también
  con guarnición, de la facción de su dueño; sus otras ciudades nacen vacías.

Reglas que se validan antes de aceptarlo:
- Mínimo 8×8, máximo 128×128.
- Al menos dos ciudades y dos posiciones de inicio, y cada jugador con una ciudad.
- Dos cosas no pueden compartir casilla, y las posiciones de inicio TAMBIÉN
  ocupan la suya: dos héroes juntos, o un héroe encima de una ciudad, se
  rechazan.
- Todo lo que no es nodo ni ciudad —minas, pueblos, recursos, monstruos, cofres
  e inicios— va DENTRO de una región, nunca sobre un muro ni sobre un nodo.
- Un camino ("roads") solo va por casillas que se pisan —una región, un nodo o
  una ciudad—. Uno sobre una barrera se rechaza diciendo la casilla: pintado
  encima de un acantilado diría que por ahí se pasa, y no se pasa.
- Desde cada inicio se debe poder llegar a pie a todas las ciudades.
- "monsters[].creature" tiene que ser un id de criatura que exista: usa los de
  "palette.creaturesForGuards", que están escritos como los espera el motor.
  Distingue mayúsculas ("skeleton" sí, "Skeleton" no) y no vale inventarse una:
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
  ciudad —pegado a uno taparía el paso—, en una región sin dueño y en una donde
  no empiece ningún héroe. Sí puede ir en las regiones que tocan una base.
- Un "towns[].owner" tiene que ser un jugador CON posición de inicio en este
  mismo plan. Para dejar una ciudad neutral, "owner": null.
- Devuelve el "width" y el "height" que se te piden en "want": el servidor
  compara la partida con agente contra la que jugaría sin él, y un tamaño
  distinto las hace incomparables.
- El ORDEN en que escribas "heroStarts" no decide nada: el servidor ordena los
  jugadores por su número, así que el 0 abre la partida lo escribas donde lo
  escribas.
- El "id" de una ciudad o de una región es un identificador, no un rótulo:
  minúsculas, letras, dígitos, guion y guion bajo, empezando por letra o dígito,
  hasta 32 caracteres. "town-0" vale; "Pueblo Uno" no. Y no puede repetirse.
  "node-N" y "village-N" los reserva el motor para los nodos y los pueblos.
- El "name" es lo que lee una persona: una sola línea, sin saltos, caracteres
  de control ni marcas de dirección, sin empezar por un acento suelto, no en
  blanco y sin caracteres de uso privado ni sin asignar, hasta 40 caracteres.
- "heroStarts" tiene que traer EXACTAMENTE los jugadores de "want.players", uno
  por jugador: ahí van sus números, así que no hay nada que deducir. Sin repetir
  ninguno y sin inventarte un tercero. Un inicio de más deja dos héroes con el
  mismo id; un jugador sin inicio se queda sin héroe y sin turnos.
Si algo falla se te devuelve la lista de problemas para que lo corrijas.`,

  hero_from_troop: `Responde con:
{
  "name": "el nombre del héroe",
  "story": "su historia, en una línea",
  "heroType": "<id de uno de heroTypes>",
  "reasoning": "una línea opcional"
}

Un individuo de tu tropa ha llegado al nivel máximo y está en tu base: se hace
HÉROE, y lo creas tú a partir de lo que fue. "veteran" es quién era —su
criatura, su nivel, su experiencia, sus batallas, sus bajas y los héroes
rivales que derribó—, y "town" dónde está.

- "name": una sola línea, sin saltos, caracteres de control ni marcas de
  dirección, sin empezar por un acento suelto, no en blanco y sin caracteres de
  uso privado ni sin asignar, hasta 40 caracteres.
- "story": lo mismo, hasta 280 caracteres. La ve quien juega en el panel del
  héroe.
- "heroType": el "id" de uno de "heroTypes", que son los de TU facción. Uno de
  otra facción o uno inventado se rechaza diciendo los que valen. El tipo
  todavía NO da ninguna habilidad: se guarda, se ve y se usará cuando exista.

El héroe nace en tu base con la experiencia del veterano (nivel ${NIVEL_MAXIMO_DE_TROPA} o más), las
cifras de un héroe contratado y SIN MOVIMIENTO hasta mañana. El veterano deja
de estar donde estaba. Si nace en la casilla del castillo, se lleva la
guarnición que le quepa, como uno contratado; si la casilla la ocupa otro
héroe tuyo —el que llevaba al veterano, por ejemplo—, nace al lado sin tropa y
la guarnición se la lleva el del castillo, que es quien la defiende. Si tu respuesta no vale —o no llega—, no
pasa nada: la tropa sigue igual y no se te vuelve a preguntar por él hasta que
salga de la base y vuelva.`,
};
