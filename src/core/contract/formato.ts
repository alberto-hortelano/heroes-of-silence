/**
 * Contrato entre el juego y el agente que hace de modelo.
 *
 * Cada petición lleva un `kind` y **embebe su propio esquema de respuesta**,
 * como en el `narrative_listen` de ne-fan: así el agente no tiene que recordar
 * el formato entre turnos ni consultar documentación aparte.
 *
 * Todo lo que llega del agente se valida con zod ANTES de tocar el estado. Una
 * respuesta mal formada se rechaza con un mensaje que dice qué falta. Los esquemas
 * están en `esquemas.ts`: los dos eran `agent.ts` hasta la fase N de la
 * reorganización (07-11-2026), y aquí queda lo que se le embebe al agente.
 *
 * En los hechos de la crónica que se le entregan (`recentEvents`), **el
 * protagonista es siempre `actor`**, y no hay ningún otro campo que diga lo
 * mismo: siete variantes llevaban además un `player` o un `winner` con el valor
 * repetido, y nada comprobaba que coincidieran. `winner` sigue existiendo solo
 * en `battle_ended`, donde significa otra cosa — el bando que gana la batalla,
 * `attacker` o `defender`, no un jugador.
 */
import { FORMA_DEL_TABLERO } from '../battle/board.js';
import { CARGA, CARGA_MINIMA } from '../battle/carga.js';
import {
  type CruceDeLaRueda,
  dichoDelCruce,
  esFusionado,
  LAS_TRES_RUEDAS,
  lasRuedasQue,
  PARTES,
} from '../battle/formas-de-la-rueda.js';
import { GRANADA } from '../battle/granada.js';
import { reglaDeLaMuralla } from '../battle/muralla.js';
import { HERO_BODY } from '../battle/types.js';
import { TOPES_DE_TROPA } from '../combate.js';
import { REGLA_DEL_ESCUDO } from '../equipo/manos.js';
import { LARGO_DE_LINEA, LINEAS_POR_VECINO, MAX_VOCES_POR_RESPUESTA } from '../gente/voces.js';
import { GARRISON_LEADERSHIP } from '../hero/troop.js';
import { hechizo } from '../magia/catalogo.js';
import { queHaceElHechizo } from '../magia/dicho.js';
import { LADO_MAXIMO_DEL_PLAN, LADO_MINIMO_DEL_PLAN } from '../map/generar/plan.js';
import { BARRERAS_DEL_PUEBLO } from '../map/map.js';
import { LADO_DEL_RECINTO, SEPARACION_DE_CIUDADES } from '../map/recinto.js';
import { BARRERAS, BARRERAS_DE_DESNIVEL, NIVELES } from '../map/terrain.js';
import { CLIMA, PEDIDOS_QUE_SE_MIRAN, TIEMPOS } from '../state/clima.js';
import { REGLA_DEL_PUEBLO } from '../state/renta.js';
import { MURALLAS_DEL_MAPA, OBRAS_DEL_PUESTO } from '../state/sitios.js';
import { MAX_HEROES_PER_PLAYER } from '../state/tipos.js';
import { enumerar } from '../texto.js';
import { HUECOS, TIPOS_FUSIONADOS, TODOS_LOS_GOLPES } from '../types.js';
import { unidadesDelJuego } from '../unidad/catalogo.js';
import {
  CRUCE_AL_AGENTE,
  HIT_DE_GOLPE,
  JUGADA_DE_MURALLA,
  ruedaAlAgente,
  SLOT_DE_HUECO,
  SLOTS,
  UPGRADE_DE_MEJORA,
} from './vocabulario.js';

/**
 * Los poderes de las unidades del juego (los hechizos que usan con su turno), por su
 * id y con lo que hacen (`queHaceElHechizo`, lo que lee el panel).
 */
const PODERES_EN_PROSA = [...new Set(unidadesDelJuego().flatMap((u) => u.poderes ?? []))]
  .map((id) => {
    const h = hechizo(id);
    return `"${id}" (${h.nombre}: ${queHaceElHechizo(h, 0)})`;
  })
  .join(', ');

/** Unos tipos en el contrato: «"offensive", "strong"». */
const enHits = (tipos: readonly (keyof typeof HIT_DE_GOLPE)[]): string[] =>
  tipos.map((t) => `"${HIT_DE_GOLPE[t]}"`);

/**
 * Las tres ruedas en el contrato, tal como llegan en `wheel` (`ruedaAlAgente`):
 * «la de 7, "offensive", "strong"…, con "normal" en el centro y "crossing":
 * "distance"; …».
 */
const RUEDAS_EN_PROSA = LAS_TRES_RUEDAS.map((f) => {
  const w = ruedaAlAgente(f);
  const centro = w.center ? 'con "normal" en el centro' : 'sin centro';
  return `la de ${w.types}, ${w.ring.map((h) => `"${h}"`).join(', ')}, ${centro} y "crossing": "${w.crossing}"`;
}).join('; ');

/**
 * Cómo se cruzan dos tipos en cada forma de la rueda (`puntoDelCruce`,
 * `dichoDelCruce`): una frase por cada una distinta, con las ruedas que la siguen
 * («Con "cycle" (la de 3), …»). Las de 3 y 5 cruzan igual, pero solo la de 5
 * tiene un tipo enfrente.
 */
const CRUCES_EN_PROSA = (Object.keys(CRUCE_AL_AGENTE) as CruceDeLaRueda[])
  .flatMap((c) =>
    [...new Set(LAS_TRES_RUEDAS.filter((f) => f.cruce === c).map((f) => dichoDelCruce(f)))].map(
      (dicho) => ({ c, dicho }),
    ),
  )
  .map(
    ({ c, dicho }) =>
      `Con "${CRUCE_AL_AGENTE[c]}" (${lasRuedasQue((f) => dichoDelCruce(f) === dicho)}), ${dicho}`,
  )
  .join(' ');

/** Lo que es un fusionado, con sus partes (`PARTES`), y en qué ruedas los hay. */
const FUSIONADOS_EN_PROSA = `En ${lasRuedasQue((f) => f.golpes.some(esFusionado))}, ${TIPOS_FUSIONADOS.map(
  (t) => `"${HIT_DE_GOLPE[t]}" junta ${enumerar(enHits(PARTES[t]))}`,
).join(', ')}, con el efecto de cada uno A LA MITAD (nunca tanto como el suelto).`;

/** Los golpes tras los que se puede andar: los que llevan la Finta (`PARTES`). */
const CON_FINTA_EN_PROSA = enumerar(
  enHits(TODOS_LOS_GOLPES.filter((t) => PARTES[t].includes('finta'))),
  'o',
);

/** Los topes de tropa que se pueden elegir: «3, 5 o 7». */
const TOPES_EN_PROSA = enumerar(TOPES_DE_TROPA.map(String), 'o');

/** Los huecos que el héroe trae puestos al nacer y los que trae vacíos, derivados del equipo base. */
const HUECOS_DE_SERIE = HUECOS.flatMap((h) => {
  const id = EQUIPO_BASE[h];
  return id === undefined ? [] : [`"${id}" en "${SLOT_DE_HUECO[h]}"`];
}).join(' y ');
const VACIOS_DE_SERIE = HUECOS.filter((h) => EQUIPO_BASE[h] === undefined).map(
  (h) => `"${SLOT_DE_HUECO[h]}"`,
);

import { EQUIPO_BASE } from '../hero/cuerpo-del-heroe.js';
import { RANGO_MAXIMO_DE_TROPA } from '../hero/rango.js';
import { ECONOMIA } from '../town/economia.js';
import type { RequestKind } from './esquemas.js';
import { COMO_SE_LEE_EL_MAPA } from './mapa-conocido.js';
import { CATALOGO_DE_EQUIPO_EN_PROSA } from './vistas.js';

/**
 * Descripción del formato de respuesta que viaja DENTRO de cada petición.
 * Es prosa deliberadamente: el agente lee esto en el mismo mensaje que el
 * estado, y no tiene que ir a buscar nada.
 */
export const RESPONSE_FORMAT: Readonly<Record<RequestKind, string>> = {
  adventure_turn: `Responde con:
{
  "actions": [ ...acciones en orden... ],
  "weather": [ ...opcional: el clima que pides, ver CLIMA abajo... ],
  "reasoning": "una línea opcional explicando el plan"
}

Acciones válidas (el turno termina solo, no hace falta enviar end_turn):
  { "type": "move_hero", "hero": "<id>", "to": { "x": N, "y": N } }
  { "type": "build",     "town": "<id>", "building": "<id de edificio>" }
  { "type": "recruit",   "town": "<id>", "creature": "<id>", "count": N }
  { "type": "dismiss",   "hero": "<id>", "creature": "<id>", "count": N }
  { "type": "leave_troops", "hero": "<id>", "creature": "<id>", "count": N }
  { "type": "leave_troops", "hero": "<id>", "creature": "<id>", "count": 1, "veteran": "<id de veterano>" }
  { "type": "take_troops",  "hero": "<id>", "creature": "<id>", "count": N }
  { "type": "take_troops",  "hero": "<id>", "creature": "<id>", "count": 1, "veteran": "<id de veterano>" }
  { "type": "buy_item",  "town": "<id>", "item": "<id de pieza>" }
  { "type": "equip",     "hero": "<id>", "item": "<id de pieza>" }
  { "type": "equip",     "hero": "<id>", "item": "<id de pieza>", "veteran": "<id de veterano>" }
  { "type": "equip",     "hero": "<id>", "item": "<id de pieza>", "creature": "<id de criatura>" }
  { "type": "equip",     "hero": "<id>", "item": "<id de pieza>", "slot": "${SLOT_DE_HUECO.segunda}" }
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
  menos gente de la que salió —o no llegar—. Un grupo solo se ve cerca de lo
  tuyo: el que patrulla una región fuera de tu vista también te embosca.
- Si al andar ves un grupo que te emboscaría más adelante en la ruta y que no
  era el que ya veías emboscarte al salir —uno que no veías, o el siguiente
  cuando por el camino ganas fuerza (tomar un nodo dispersa a los grupos de
  la región que cierra) y el primero deja de sacarte el margen—, el héroe se para donde lo
  ve ("march_halted" en recentEvents) y conserva lo andado; el veredicto lo
  cuenta como marcha que entró parcialmente y dice qué grupo la paró. Las
  acciones que vengan detrás se siguen aplicando; con el grupo ya a la vista
  decides el turno que viene si sigues. Una emboscada antes del destino
  también sale en el veredicto como marcha parcial.
- NIVEL y RANGO son dos cosas. El NIVEL de una unidad es la primera cifra de
  su ÍNDICE DE PODER ("powerIndex": 340 es el nivel 3), que sale de sus cifras
  CON SU EQUIPO PUESTO (ataque, defensa, PV, daño de cada arma, armadura,
  velocidad, tiro y doble golpe): nadie lo escribe.
- FUERZA y AGILIDAD: toda unidad y todo héroe tienen fuerza ("strength") y
  agilidad ("agility"), y de ellas salen las demás cifras: la DEFENSA es la
  agilidad más la del escudo (y la Defensa del héroe); el DAÑO va de F a F ×
  agilidad, con F = fuerza + la que suma su arma (lo torpe y fuerte pega
  parejo; lo ágil, con mucha variación); las CASILLAS que anda son la agilidad.
  Toda pieza tiene un PESO ("weight" en "creature_stats" es lo que pesa lo de
  serie): hasta la fuerza no resta nada, y por cada fuerza entera, o parte de
  ella, que lo pase, −1 de agilidad (fuerza 6: peso 7 → −1, 12 → −1, 13 → −2),
  como poco 1. Ninguna
  pieza resta movimiento: lo hace el peso. "defense", "damage" y "speed" ya
  vienen con todo eso hecho. "creature_stats" da de cada
  unidad su "level", su "powerIndex", su "dwelling" (el edificio de su facción
  que la produce; uno produce varias, y el edificio no implica nivel), su equipo
  de serie ("equipment") y su "armor", y "mapSpeed", lo que cuenta en la marcha
  del mapa; lo que cuesta y crece sale de su índice.
  El RANGO es la experiencia: la
  TROPA va del 1 al 5, y todo HÉROE empieza en el 5 —el inicial y el
  contratado— y sube sin tope (6, 7, 8…). Cada rango suma cifras (a la tropa,
  ataque y fuerza; al héroe, cuerpo y LIDERAZGO, el tope de su ejército), así
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
  cuántos lleva: como mucho "you.combat.troopCap" − 1 individuos además del
  héroe, que pelea en el tablero y cuenta como uno (con el tope de siempre, 7:
  6 y él); y "heroes[].leadership", donde "used" es lo que ocupa y "max" su
  tope. "you.combat.troopCap" es el tope de individuos por bando de esta
  partida (${TOPES_EN_PROSA}), el de toda batalla: las guarniciones, los
  monstruos y los asaltantes también se quedan en él. Cada criatura ocupa lo que dice
  "recruitable[].leadership" por individuo. Un "recruit" que no quepa se
  rechaza diciendo cuántos caben, por ejemplo: "no cabe: el ejército ocupa 18
  de 20 de liderazgo y 2 × Piquero piden 8" o "no cabe: el ejército ya lleva 6
  de 6 individuos". Sin héroe en el pueblo se recluta a la guarnición, que
  guarda como mucho "you.combat.troopCap" individuos y tiene su propio tope en
  "towns[].garrisonLeadership". Con un héroe tuyo dentro se recluta a su
  ejército. Tu base NACE con la guarnición llena.
- GUARNICIONES: la tropa no se recoge sola al pasar por casa. Un héroe tuyo
  PARADO en un sitio tuyo —una ciudad, un paso ("node") o un pueblo
  ("village") de una región tuya o que ya guardas— deja tropa en su
  guarnición con "leave_troops" y la recoge con "take_troops" ("count"
  individuos de "creature"; de cada tipo se mueven los de menos experiencia, o
  el veterano que digas con "veteran"). La guarnición de cualquier sitio cabe
  en ${GARRISON_LEADERSHIP} de liderazgo y "you.combat.troopCap" individuos, y la del ejército
  en su "leadership"; lo que no cabe se rechaza diciendo cuántos caben.
  "you.garrisons" dice qué guarda cada paso y cada pueblo
  tuyo, y lo tuyo que se quedó en un sitio que ya no es tuyo (la de tus
  ciudades, en "towns[].garrison"); de ese sitio puedes RECOGERLA, no dejar
  más. Un sitio del muro que pierdes pierde su guarnición. Una ciudad, un paso o
  un pueblo con guarnición AJENA (también la neutral de una ciudad neutral) se
  alcanza pero no se cruza: pisarlo es pelear contra ella; si la vences, el
  sitio del muro es tuyo y el de dentro de una región se queda sin guarnición,
  y tu héroe se queda en la casilla de antes. La guarnición ajena no se ve
  hasta pisarla. Esa batalla llega en "recentEvents" con "foe": { "kind":
  "garrison", "site": "<id>" }: la guarnición SIN héroe del sitio, "site" su id
  en "knownMap", y del jugador que la dejó allí ("owners" en el "battle_ended";
  null, la neutral).
- OCUPACIÓN: una ciudad o un pueblo TUYO con tropa de otro dentro —un héroe
  rival parado en su casilla, o una guarnición que no es tuya (la de quien lo
  tenía, o la neutral de una ciudad cuya región ya es tuya)— está OCUPADO:
  mientras dure no te da oro, y una ciudad tampoco recluta, ni construye, ni
  crecen sus moradas (esa semana se pierde), ni se contrata, ni vende su
  armería; cada rechazo lo dice. Lo ves en "knownMap" ("occupiedBy" de la ciudad o el pueblo:
  { "hero", "owner" } o { "garrison": dueño }), en "towns[].occupied" (y esa
  ciudad trae "income" 0 y "canBuildNow" y "recruitable" vacíos: no hay nada que
  hacer en ella) y en "income" ("occupied" de cada ciudad y pueblo, con 0 de oro), y lo cuentan
  "site_occupied" y "site_freed" en "recentEvents". Se RECUPERA moviendo un
  héroe tuyo a su casilla: es una batalla contra el ocupante, tras la muralla
  del sitio; si ganas, vuelve a darte lo suyo. Si el ocupante se va, también.
  Ocupar no quita el sitio a nadie: un héroe tuyo parado en una ciudad o un
  pueblo ajeno de DENTRO de una región lo ocupa (si tiene guarnición, la vences
  antes), pero no es tuyo, ni reclutas, ni construyes, ni dejas tropa en él.
- PUESTOS: el "upgrade" de un "node" de "knownMap" es la obra de ese paso (la
  última que viste) y la muralla de su batalla: "${UPGRADE_DE_MEJORA.ninguna}", "${UPGRADE_DE_MEJORA.empalizada}" o "${UPGRADE_DE_MEJORA.muralla}".
- DEFENSA: si atacan a un héroe tuyo en un sitio tuyo con guarnición, defiende
  él (siempre pelea) con lo más fuerte que quepa en su ejército de entre su
  tropa y la guarnición: lo elige el juego por ti (aún no hay jugada para
  elegirlo), y "recentEvents" lo cuenta con "defense_set" ("fighting" con él,
  "staying" fuera). Lo que se queda fuera no pelea, y si pierde la batalla se
  pierde con el sitio: la ciudad o el paso son del rival. Sin héroe, defiende
  la guarnición entera.
- "dismiss" LICENCIA individuos del ejército de un héroe que está en un castillo
  tuyo (tu base u otro): se van para siempre, no vuelven a la guarnición. Sirve
  para CAMBIAR tropa: con el liderazgo o los 6 individuos llenos de lo barato,
  un "recruit" de algo mejor no cabe; licencia primero lo que sobra y recluta
  después, en el mismo turno y en ese orden. De cada criatura se van primero
  los de MENOS experiencia: el veterano no se va mientras quede un novato de su
  tipo. Fuera de un castillo tuyo se rechaza diciéndolo.
- EQUIPO: todo héroe y todo individuo de la tropa tiene seis huecos
  (${SLOTS.join(', ')}) y en cada uno lleva una pieza o nada: "${SLOT_DE_HUECO.arma}" es
  el arma de cuerpo a cuerpo y "${SLOT_DE_HUECO.segunda}" una segunda (otra arma de
  cuerpo a cuerpo de una mano: con dos, cada cifra del golpe es la de la mejor
  —ataque, fuerza y cada tipo de la rueda— y el peso, la suma; un arma va a
  "${SLOT_DE_HUECO.arma}" salvo que "equip" diga "slot": "${SLOT_DE_HUECO.segunda}"),
  "${SLOT_DE_HUECO.distancia}" la que dispara (llevarla ya es disparar, sin munición
  que contar), "${SLOT_DE_HUECO.armadura}" la armadura y
  "${SLOT_DE_HUECO.escudo}" el escudo, opcional: ${REGLA_DEL_ESCUDO} (lo que no cabe se rechaza diciéndolo),
  y "${SLOT_DE_HUECO.montura}" la MONTURA. Una montura tiene su propia fuerza, agilidad y
  peso, que no se suman a las de quien monta. La DE GUERRA se monta en batalla:
  lo que pesa el equipo del jinete más ella se mide contra la fuerza de ella, sus
  casillas son las de la montura (su agilidad menos lo que le reste ese peso) y el
  jinete pelea con su agilidad entera (defensa y daño sin restar peso). La DE
  SILLA no entra en batalla: allí pelea a pie, con sus casillas y su peso. En el
  MAPA, cada uno anda lo de su montura (de guerra o de silla) o lo suyo a pie, y
  la marcha del héroe la marca el más lento del grupo, el héroe incluido: un
  caballo de silla solo sirve si lo llevan todos ("creature_stats" dice
  "mapSpeed"). La LANZA es un arma de cuerpo a cuerpo más; lo único que hace es
  poner la fuerza de la montura de guerra en la carga (abajo, CARGA en batalla).
  Cada pieza suma sus cifras a quien la lleva
  (un arma, ataque y fuerza para el daño de su golpe; un escudo, defensa) y
  pesa (el peso de todo lo puesto que pasa de la fuerza resta agilidad);
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
  "equip" pone una pieza de la mochila del héroe en su hueco, o en el que diga
  "slot" (un arma, también en "${SLOT_DE_HUECO.segunda}"): sin más, al propio héroe; con
  "veteran", al individuo de su tropa con ese id (las filas de "army" con "id");
  con "creature", a un individuo de ese tipo que todavía no tenga id (uno de los
  que van agrupados en su fila), que pasa a tenerlo y a ir en su propia fila. Lo que ocupaba ese hueco vuelve a la mochila. "unequip"
  quita la pieza de un hueco y la devuelve a la mochila. Se equipa en cualquier
  sitio, fuera de batalla. La pieza de un individuo se pierde si muere; si lo
  licencias, vuelve a la mochila del héroe. Si un héroe cae sin base, pierde
  equipo y mochila. Las piezas:
${CATALOGO_DE_EQUIPO_EN_PROSA}
- CLIMA: cada región tiene su tiempo (${TIEMPOS.join(', ')}) y puede ser de
  noche. Es PRESENTACIÓN: no cambia ninguna regla (ni la vista, ni el tiro, ni
  la marcha), pero quien juega y quien mira lo ven en el mapa, la batalla y la
  base. Eres el narrador y lo puedes pedir: en "weather", cada entrada es
  { "at": { "x": N, "y": N }, "weather": "<tiempo>", "night": true|false,
  "days": N }, con "weather", "night" o los dos; cubre la región de esa casilla
  (cualquiera, aunque no la hayas visto) desde hoy y "days" días (1 si no lo
  dices, ${CLIMA.diasMaximos} como mucho), y sustituye lo que esa región tuviera
  pedido. Como mucho ${CLIMA.porTurno} por turno, una vez cada región (se miran
  los ${PEDIDOS_QUE_SE_MIRAN} primeros). Se aplica
  ANTES que las acciones: una tormenta pedida hoy cae sobre el asedio de hoy.
  Lo que no pides sale solo, por días y por región. La NOCHE también la pone la
  narrativa: donde no la pides, cae de vez en cuando, y en las tierras de los no
  muertos mucho más a menudo. "world.weather" dice el clima de hoy en las
  regiones que has explorado ("until": hasta qué día dura lo que pediste). Un
  pedido que no vale se rechaza con su motivo en el veredicto, sin tocar el
  resto del turno.
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
- Con un héroe dentro de una ciudad, la defiende él con lo que se elija de su
  tropa y de la guarnición (DEFENSA, arriba). Esa batalla es la final: si la
  pierde, la ciudad cae con lo que no peleó, y si era tu base, pierdes la
  partida.
- ORO: es el ÚNICO recurso (no hay minas, ni madera, ni mineral). "you.gold"
  es tu oro y "you.income" lo que cobrarás al empezar tu próximo turno:
  "total" y de dónde sale, "towns" (cada ciudad tuya, con el "gold" que da su
  ayuntamiento; tu base es la primera; la que está cortada de tu base lleva
  "connected": false y da 0) y "villages" (cada
  pueblo tuyo, ${ECONOMIA.rentaDelPueblo} de oro cada uno; el que está cortado de tu base, también
  el del muro que acabas de tomar y aún no une nada, lleva "connected": false y da 0). Lo
  que te cortan de la base deja de pagar. Todo "cost" —"canBuildNow",
  "recruitable", "towns[].armory"— es oro: un número. Un "build" o un
  "recruit" sin oro bastante se rechaza diciendo cuánto cuesta y cuánto tienes.
- Cada héroe trae su "type", el TIPO de héroe (un id de los de su facción), y
  el que nació de la tropa trae además su "story". El tipo todavía NO da
  ninguna habilidad, salvo si se INFILTRA: algunos tipos de cada facción lo
  hacen.
- INFILTRACIÓN: "heroes[].infiltrates" dice si el héroe cruza barreras. Lo hace
  si su tipo se infiltra Y toda su tropa lleva el rasgo "infiltrarse" (en
  "creature_stats", "traits"); basta uno sin él para que no, y entonces
  "heroes[].infiltrationBlocker" dice quién. Un héroe así puede pisar las casillas
  de las cinco barreras como cualquier otra, con el mismo "move_hero" (no hay
  jugada nueva), pero cada casilla de barrera cuesta el DÍA ENTERO de marcha
  (los "movePoints" con que empezó el día, aunque luego cambie su tropa): solo
  se entra con el día recién empezado; si ya anduvo, espera en el borde hasta
  mañana. N casillas, N días: un "move_hero" a varios días anda lo de hoy, como
  siempre. Parado en una barrera es INTOCABLE: no lo
  emboscan los asaltantes ni lo alcanza un héroe que no se infiltra. La muralla
  de una ciudad no es una barrera y no se cruza.
- Un VETERANO de rango ${RANGO_MAXIMO_DE_TROPA} —el tope de la tropa— que esté en tu base al empezar
  tu turno, en la guarnición o en la tropa de un héroe tuyo que esté allí, SE
  HACE HÉROE: antes de este turno se te pide con "hero_from_troop" que le des
  nombre, historia y tipo. Nace en la base, con su experiencia y sin movimiento
  ese día. Nadie recoge la guarnición: si atacan la base, el héroe de la
  casilla del castillo defiende con lo que se elija de su tropa y de ella.
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
- Un objeto "lugar" del mapa (con su "name") es un sitio de la historia del
  mundo, con su gente y sus diálogos. Tú todavía NO entras en ellos: no hay
  jugada para eso. Se puede pisar y cruzar como cualquier casilla.
- "enemyHeroes" son los que ves AHORA, cerca de un héroe, una ciudad o un nodo
  tuyos (el radio de "knownMap"): si no aparece ninguno, no significa que no
  haya, solo que nadie tuyo los tiene a la vista.
- "recentEvents" es lo que OBSERVABAS cuando ocurrió, no todo lo que pasó. Lo
  tuyo entra siempre, y también perder un castillo, un nodo o un héroe aunque
  te los quiten lejos; del rival solo llega lo que alguien tuyo tenía a la vista en ese
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
atacante es su grupo, sin héroe, y no se rinde. Una GUARNICIÓN de un paso o
un pueblo ("foe": { "kind": "garrison", "site": "<id>" } en el
"battle_started") es la tropa que su dueño dejó allí, SIN héroe: si es tuya y
te la atacan, la defiendes sin héroe y sin rendición; si es del rival, la
atacas y el defensor no tiene héroe. "stacks" con tu "side" son los tuyos.

El tablero viene en "board": ${FORMA_DEL_TABLERO}. Una acción a una casilla
que no existe se descarta.

Acciones válidas para la unidad activa:
  { "type": "move",   "to": { "col": N, "row": N } }
  { "type": "attack", "target": "<id de stack>", "from": { "col": N, "row": N }, "hit": "<golpe>" }
  { "type": "aim",    "at": { "col": N, "row": N } }
  { "type": "throw",  "at": { "col": N, "row": N } }
  { "type": "cast",   "spell": "<id>", "target": "<id de stack>" }
  { "type": "power",  "power": "<id de poder>", "target": "<id de stack aliado>" }
  { "type": "surrender", "gold": N }
  { "type": "end_turn" }

Notas:
- "move" NO acaba el turno de la unidad: gasta casillas de su "stepsLeft" y se
  te vuelve a pedir acción para la misma unidad, así que puedes moverte en
  varios tramos. Tras moverse solo puede moverse más, atacar cuerpo a cuerpo o
  terminar con "end_turn": ni apuntar. Atacar acaba el turno. "end_turn" cierra
  el turno también sin moverse: es lo que se manda para no hacer nada (no hay
  "wait" ni "defend": se retiraron). Si tras un "move" ya no le queda ni
  casilla a la que ir ni enemigo al lado, el turno se cierra solo y no se te
  pregunta por ella.
- "turnId" numera los turnos de la batalla: mientras sea el mismo, sigues en el
  mismo turno de la misma unidad, y un "move" no lo cambia. La misma unidad
  puede tener otro turno justo después (la última de una ronda abre a veces
  la siguiente): llega con otro "turnId" y su "stepsLeft" entero. La moral
  ("morale") no da ni quita turnos: hoy no tiene efecto en la batalla.
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
  pegado. Cada casilla suma un ${CARGA.porcentaje} % de daño, hasta ${CARGA.tope}; solo el
  primer golpe la cobra. Con una montura de guerra y una lanza puestas, la
  horquilla de ese golpe es la de la fuerza de la montura más la de la lanza, por
  la agilidad del jinete ("chargeDamage" en "creature_stats"). Lo andado en
  tramos anteriores no cuenta: cada tramo se vuelve a medir. "chargeFrom" te
  lista las cargas que tienes ahora mismo: contra qué "target", desde qué
  casilla ("col", "row") y con cuántas casillas cobrarías ("hexes"); solo viene
  cuando hay alguna. Un "move" a esa casilla NO carga: solo mueve.
- SALIR DEL CONTACTO cuesta: dejar una casilla con N enemigos al lado que te
  puedan golpear cuerpo a cuerpo cuesta 1 + N de "stepsLeft". Las casillas de
  "legalActions" ya lo descuentan; si no te llega para salir, no te mueves
  (golpea o termina el turno). La carga se paga por la recta.
- Cada golpe cuerpo a cuerpo pasa por la RUEDA DEL GOLPE: quien pega elige su
  golpe ("hit" en el "attack") y quien recibe su respuesta, a la vez y sin ver
  el otro. La partida juega con una de tres ruedas, la misma en toda batalla
  ("you.combat.wheel" en el turno de aventura, "wheel" en cada petición de
  batalla: "types", su anillo "ring" en el sentido del reloj desde arriba,
  "center" si lleva "normal" en el centro y "crossing"): ${RUEDAS_EN_PROSA}.
  Solo valen los de su "ring" y "normal" si lleva centro. El cruce fija el daño
  dentro de la horquilla del arma: con "normal" en cualquiera de los dos, el
  medio. ${CRUCES_EN_PROSA} La respuesta es además el tipo del contraataque, que
  cae en el punto contrario: quien acierta la respuesta recibe el mínimo y
  devuelve el máximo. ${FUSIONADOS_EN_PROSA} Lo que hace cada tipo con
  el arma de tu unidad activa viene en "hits", cuando puede golpear. Sin "hit",
  tu golpe lo elige la IA a ciegas por ti; uno que no es de la lista descarta
  el "attack" como cualquier acción ilegal. Cuando el rival golpea a una unidad
  tuya, se te pide la respuesta con "battle_response". El registro cuenta cada
  cruce con el hecho "cruce" ("hit" de quien pegó, "response" de quien
  respondió). Tras golpear con ${CON_FINTA_EN_PROSA}, el turno de esa
  unidad sigue solo para andar (o "end_turn"). El disparo no pasa por la rueda: su tirada la fija la distancia a la casilla apuntada.
- DISPARO DIFERIDO (regla nuestra, nueva y aún sin validar): un tirador
  ("shooter": true) sin moverse y sin un enemigo al lado APUNTA con "aim" a una
  casilla del tablero ("at", cualquiera menos la suya: "legalActions" trae solo
  las de los enemigos, pero vale cualquier otra). Apuntar CIERRA su turno, y su
  stack lleva "aimedAt" con la casilla (lo ves también en los del rival). Al
  EMPEZAR su siguiente turno, antes de que elijas nada, sale el disparo desde
  donde esté, por la recta exacta que une el centro de su casilla con el de la
  apuntada, y da al PRIMERO que encuentre en una casilla que la recta atraviese
  (aunque solo le roce una esquina), sea del bando que sea —también a uno tuyo
  que se haya puesto en medio—; la recta no acaba en la casilla: sigue tras ella
  hasta el borde del tablero, y si no hay nadie no da a nadie. Desde el suelo
  sube a lo alto del muro y da al primero que haya arriba, y lo para bajar del
  muro (lo de detrás no se alcanza) o una puerta cerrada; desde lo alto, nada.
  El daño va por la
  horquilla de su arma de distancia según lo cerca que pase la recta del centro
  de la casilla del alcanzado: por el centro, el máximo; cada octavo de casilla
  de separación baja un cuarto de la horquilla; a media casilla o más, el
  mínimo (apuntar justo a su casilla es el máximo); luego ataque contra defensa
  y armadura. Con "double_shot", dos tiros por la misma recta. Si el
  tirador muere antes, el disparo se pierde. Tras el disparo, su turno sigue:
  puede apuntar otra vez o actuar como siempre. El registro lo cuenta con
  "aimed" ("at") y "shoot" ("at" y "target", null si no dio a nadie).
- "walls" es la muralla del tablero, y null si esta batalla no la lleva; con
  ella, la petición trae al final cómo se juega (MURALLA).
- ARMAS DE FUEGO (regla nuestra, nueva): la pistola, el arcabuz y la culebrina
  disparan como cualquier tirador (DISPARO DIFERIDO), con dos diferencias. Su
  disparo PERFORA la armadura: llega entero, sin restar la del alcanzado. Y
  RECARGAN: tras salir el disparo, la unidad pasa los turnos de su recarga sin
  poder apuntar, contando el turno en que sale (con recarga 1, apunta un turno sí y
  otro no). Mientras recarga, su stack lleva "reloading" con los turnos que le
  faltan y "legalActions" no trae ningún "aim" suyo. La horquilla de un arma de
  fuego es estrecha: la de su propia agilidad, no la del cuerpo. En
  "creature_stats", quien lleva un arma de fuego trae "reload" (su recarga). Nada de
  esto tira dado.
- GRANADAS (regla nuestra, nueva): quien lleva granada ("grenades" en su stack:
  las que le quedan en esta batalla; "grenadeRange", hasta cuántas casillas la
  lanza, que es la fuerza de su cuerpo) no apunta: LANZA con "throw" a una casilla
  a su alcance ("at", cualquiera menos la suya: "legalActions" trae solo las de los
  enemigos a su alcance, pero vale cualquier otra que lo esté), sin moverse antes y
  sin un enemigo al lado. Va por encima: no la para nadie en medio, ni un muro ni
  una puerta. Lanzar CIERRA su turno y gasta una granada; con 0 no se lanza, y no
  se reponen hasta la batalla siguiente. Su stack lleva "grenadeAt" con la casilla
  (también en los del rival). Al EMPEZAR su siguiente turno, antes de que elijas
  nada, EXPLOTA: da a todo el que esté entonces en esa casilla (la tirada en el
  cuarto ${GRANADA.cuartoDelCentro} de 4 de la horquilla de la granada: 0 el mínimo, 4 el máximo) y
  en sus seis vecinas (en el cuarto ${GRANADA.cuartoDelAnillo} de 4), SEA DEL
  BANDO QUE SEA, también a quien la lanzó si sigue cerca; la armadura se resta como
  siempre. Sin dado. Si quien la lanzó muere antes, no explota. El registro lo
  cuenta con "thrown" ("at") y un "blast" por alcanzado ("at", "target", "damage",
  "cuarto"; "target" null si no dio a nadie).
- "power" usa un PODER de la unidad activa ("stacks[].powers": ${PODERES_EN_PROSA}):
  un hechizo de "spell_list" que lanza ella, sin maná, con "target" (una unidad), "at" (una
  casilla) o nada, como diga el hechizo. Gasta su turno entero y solo sin haberse movido; los que
  puede usar ahora vienen en "legalActions".
- "cast" NO consume el turno de la unidad activa: lanza el héroe, se cobra el
  maná y una tirada por ronda, y después la unidad sigue pudiendo moverse,
  apuntar o atacar. Se te volverá a pedir acción para el mismo stack.
- MAGIA: cada hechizo de "spell_list" dice a qué se lanza ("target"): "ally",
  "enemy" o "any" llevan "target" (una unidad); "tile", "at" (una casilla; vale
  cualquiera a su alcance, "legalActions" trae una por unidad viva); "self" y
  "all", nada. El héroe lanza desde la casilla de su cuerpo: «en contacto» es a
  una casilla de él y «a x casillas», hasta x. Uno diferido ("cast" con
  "diferido" en el registro, "spellAt" en el stack del cuerpo) cae al empezar el
  siguiente turno de quien lo lanzó. Lo que deja un hechizo va en
  "stacks[].effects" con su "summary" en palabras: cifras, lo que impide
  (golpear, disparar, contraatacar, moverse, lanzar) y disparadores (al empezar o
  terminar su turno, al ser golpeado, al golpear, al morir). Lo que hace un
  hechizo a cada uno de varios lo cuenta un "spell_hit"; un disparador que salta,
  un "triggered".
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
lo ves, ni aquí ni en el registro hasta que se cruzan. Valen los de la rueda de
la batalla ("wheel": su "ring" y "normal" si lleva "center"), los mismos que
trae "responses".

- El cruce fija el daño que recibes dentro de la horquilla de su arma: con
  "normal" en cualquiera de los dos, el medio. ${CRUCES_EN_PROSA}
- Tu respuesta es también el tipo de tu contraataque, que cae en el punto
  contrario: si aciertas, recibes el mínimo y devuelves el máximo.
- Si te CARGA, aún no ha corrido: "chargeFrom" dice desde qué casilla golpeará
  y cuántas casillas cobra; "responses" ya lo cuenta desde allí.
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
  tocando dos regiones o más. Una CIUDAD ("towns") va en UNO de dos sitios, y lo
  dice lo que toca (no hay campo que lo diga): EN EL MURO, entre dos regiones o
  más, es un nodo y se TOMA como un paso (la base va siempre ahí; perderla
  elimina); DENTRO DE UNA REGIÓN, tocando solo esa (por los accesos de sus
  puertas), no es un nodo: es de quien tenga la región, así que no lleva
  "owner" (null; con dueño se rechaza). No se repite en "nodes". Un nodo o una
  ciudad en el muro ABRE la casilla de muro en la que está, así que puedes
  trazar el muro entero y poner el paso encima. El nodo cruza la barrera del muro que abre —sobre "water" es
  un puente—, y uno sin muro debajo se rechaza. Dos nodos no pueden ser vecinos.
- Quitando los nodos, cada zona pisable tiene que ser EXACTAMENTE una de tus
  regiones: si dos regiones se tocan sin nodo, se te dice entre qué dos casillas
  queda el paso abierto; una zona pisable sin región declarada se rechaza; cada
  región necesita al menos un nodo, y todas tienen que alcanzarse.
- Una región es de quien tenga TODOS sus nodos, y solo da renta unida a su base.
  Los pueblos ("villages": {"name", "at"}) dentro de una región no se toman: son
  de quien tenga su región, y por eso no llevan dueño. Uno EN EL MURO, sobre
  ${BARRERAS_DEL_PUEBLO.map((b) => `"${b}"`).join(', ')} y tocando dos regiones, es un nodo, como un paso: ABRE su
  casilla de muro, se toma pisándolo y se cruza por él (sobre "water" o "wall"
  se rechaza: ahí el paso es un puente o una puerta). Uno sobre el muro que solo
  toca una región, o uno entre dos regiones sin muro debajo, se rechaza; uno que
  corta su región en dos, también. Cada uno ${REGLA_DEL_PUEBLO}.
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
  tomarla (la del muro) o para que deje de ocupar la de dentro de una región que
  ya es de alguien. La base de cada jugador —su PRIMERA ciudad en "towns", en el
  muro— nace también con guarnición, de la facción de su dueño, y su héroe
  empieza dentro; sus otras ciudades nacen vacías.

Reglas que se validan antes de aceptarlo:
- Mínimo ${LADO_MINIMO_DEL_PLAN}×${LADO_MINIMO_DEL_PLAN}, máximo ${LADO_MAXIMO_DEL_PLAN}×${LADO_MAXIMO_DEL_PLAN}.
- Al menos dos ciudades, y cada jugador de "want.players" tiene al menos una
  ciudad: la primera suya es su base y su héroe empieza dentro, en la casilla de
  la ciudad, y sale por sus puertas.
- Dos cosas no pueden compartir casilla.
- Todo lo que no es nodo, ciudad ni pueblo del muro —monstruos, cofres y los
  pueblos de dentro de una región— va en una casilla que se pisa, nunca sobre
  un muro ni sobre un nodo.
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
de estar donde estaba. Nace sin tropa, en la casilla del castillo o, si la
ocupa otro héroe tuyo —el que llevaba al veterano, por ejemplo—, al lado. La
guarnición se queda en la base: se recoge con "take_troops". Si tu respuesta no vale —o no llega—, no
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

/** Las cuatro jugadas de la muralla, como el agente las escribe (`JUGADA_DE_MURALLA`). */
const J = JUGADA_DE_MURALLA;

/**
 * Cómo se juega la muralla, para el agente: lo que lleva el formato de un
 * `battle_turn` **solo si la batalla tiene muralla** (`walls` no es null,
 * `formatoDeLaRespuesta`; simplify de la fase 2: eran ~2,2 KB en cada turno, también
 * contra monstruos y asaltantes). Las jugadas salen de la tabla del contrato y la
 * regla de la batalla de `reglaDeLaMuralla`, la misma que lee la arena; qué sitio la
 * lleva y de qué, de `data/sitios.json` (`MURALLAS_DEL_MAPA`).
 */
export const PROSA_DE_LA_MURALLA = `MURALLA (esta batalla la lleva). Toda batalla contra una CIUDAD (también la base
y la neutral) se pelea tras una muralla de ${MURALLAS_DEL_MAPA.ciudad.material} y contra un PUEBLO, tras una
de ${MURALLAS_DEL_MAPA.pueblo.material}; en un paso, la de su obra ("upgrade" del nodo: "${UPGRADE_DE_MEJORA.empalizada}", de
${OBRAS_DEL_PUESTO.empalizada.muralla.material}; "${UPGRADE_DE_MEJORA.muralla}", de ${OBRAS_DEL_PUESTO.muralla.muralla.material}; "${UPGRADE_DE_MEJORA.ninguna}", sin muralla). Viene en "walls" ("material", los muros en
"tiles", las puertas en "gates" con "open" y las escaleras puestas en "ladders",
cada una con su "foot" y su "wall"). El muro CIERRA el tablero: quien anda no lo
cruza más que por una puerta abierta. Cada unidad del ATACANTE que no vuela, y su
héroe, trae una escalera ("ladder": true en su stack, sin comprarla); quien la
pone ya no lleva otra, y la puesta la usa cualquiera de los suyos. ${reglaDeLaMuralla({
  atacante: 'el ATACANTE',
  defensor: 'el DEFENSOR',
  ponerEscalera: `ponerla ("${J.poner_escalera}", con el muro en "wall")`,
  subir: `subir ("${J.subir}", al mismo "wall")`,
  abrir: `la abre ("${J.abrir_puerta}")`,
  cerrar: `la cierra ("${J.cerrar_puerta}"; las dos con "gate", sus dos casillas "a" y "b")`,
})} Las que valen ahora vienen en "legalActions"; las demás se descartan con su
motivo. El registro lo cuenta con "ladder_placed" ("foot", "wall"), "climbed"
("from", "to"), "gate_opened" y "gate_closed" ("gate").

Acciones de la muralla para la unidad activa:
  { "type": "${J.poner_escalera}", "wall": { "col": N, "row": N } }
  { "type": "${J.subir}", "wall": { "col": N, "row": N } }
  { "type": "${J.abrir_puerta}", "gate": { "a": { "col": N, "row": N }, "b": { "col": N, "row": N } } }
  { "type": "${J.cerrar_puerta}", "gate": { "a": { "col": N, "row": N }, "b": { "col": N, "row": N } } }`;

/**
 * El formato de respuesta que viaja con la petición `kind` de `payload`: el de
 * `RESPONSE_FORMAT`, y en un `battle_turn` con muralla (`walls` no es null), además
 * la prosa de la muralla (`PROSA_DE_LA_MURALLA`). Lanza con un `battle_turn` sin
 * `walls`: lo pone siempre `serializeBattleTurn`, null o la muralla.
 */
export function formatoDeLaRespuesta(kind: RequestKind, payload: unknown): string {
  if (kind !== 'battle_turn') return RESPONSE_FORMAT[kind];
  if (typeof payload !== 'object' || payload === null || !('walls' in payload)) {
    throw new Error('un battle_turn sin «walls»: lo pone serializeBattleTurn, null o la muralla');
  }
  return payload.walls === null
    ? RESPONSE_FORMAT.battle_turn
    : `${RESPONSE_FORMAT.battle_turn}\n\n${PROSA_DE_LA_MURALLA}`;
}
