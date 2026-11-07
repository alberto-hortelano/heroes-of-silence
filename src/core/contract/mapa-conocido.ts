/**
 * El mapa que conoce el agente (`serializeKnownMap`, la misma llamada para el turno
 * y para la tool `map`), todo pasado por la niebla, y cómo se lee
 * (`COMO_SE_LEE_EL_MAPA`).
 *
 * Era parte de `serialize.ts`, que se partió en la fase N de la reorganización
 * (07-11-2026) en `vistas.ts`, `mapa-conocido.ts`, `aventura.ts`, `batalla.ts` y
 * `peticion-de-mapa.ts`.
 */
import { MARGEN_CONTRA_NEUTRALES, poderDe } from '../hero/fuerza.js';
import { pointFromKey } from '../map/geometria.js';
import { LADO_DEL_RECINTO } from '../map/recinto.js';
import { BARRERAS, costeDeEntrada, SUELOS_PISABLES } from '../map/terrain.js';
import { sitioEnUnNodo } from '../map/territorio.js';
import { asaltantesALaVista } from '../state/asaltantes.js';
import { playerById } from '../state/consultas.js';
import { REGLA_DEL_PUEBLO } from '../state/renta.js';
import type { GameState } from '../state/tipos.js';
import {
  HERO_SCOUT_RADIUS,
  NODE_SCOUT_RADIUS,
  objetosConocidos,
  visibleNow,
} from '../state/vision.js';
import type { PlayerId } from '../types.js';
import { ocupanteView } from './vistas.js';
import { UPGRADE_DE_MEJORA } from './vocabulario.js';

/**
 * Los objetos del mapa **tal como los recuerda un jugador**, cada uno con la
 * fecha de su recuerdo.
 *
 * Está fuera de `serializeAdventureTurn` porque tiene dos consumidores: el
 * `knownMap` de cada turno y la consulta `map` (#74), que hasta ahora devolvía
 * `state.map.objects` entero —el mapa del rival incluido—. La regla de «qué
 * sabe este jugador de cada objeto» es `objetosConocidos`, la misma que pinta
 * el lienzo de quien juega (#64); aquí solo se viste para el cable. Si se
 * copiara, la copia volvería a quedarse atrás, que es exactamente lo que pasó.
 *
 * Levanta su propio `visibleNow`, sin recibirlo: la consulta no tiene ningún
 * otro motivo para construirlo, y encadenárselo al llamante haría que el
 * próximo se lo pasara mal calculado. Son 81 claves por héroe una vez por
 * petición del agente, no algo que corra dentro de una partida.
 */
function knownObjects(state: GameState, playerId: PlayerId) {
  // Dos capas, y la diferencia importa: `fog` es «esto lo conozco alguna vez» y
  // `visibleNow` es «esto lo estoy viendo ahora». Del presente solo se puede
  // afirmar lo segundo; de lo demás se manda el RECUERDO, con su fecha. La
  // regla es `objetosConocidos`, la misma que pinta el lienzo de quien juega.
  const conocidos = objetosConocidos(state, playerId, visibleNow(state, playerId));

  // El `switch` de dentro cubre la unión entera de `o.kind` y no lleva
  // `default`: un `default` para callar al linter escondería justo lo que
  // interesa ver rojo, que un `kind` nuevo del mapa no se serializa.
  //
  // Quien lo pone rojo es el `never` de abajo, y no el `biome-ignore` que
  // hubo aquí: comprobado quitando el `case 'chest'`, con el `ignore`
  // puesto **compilaba y linteaba limpio**. Un guardia ciego durante todo
  // el tiempo que nadie lo rompió a mano.
  return conocidos.map(({ day, object: o, sitio }) => {
    const cuando = { lastSeen: day };
    // De una ciudad o un pueblo: el dueño que se vio (derivado, no el del objeto:
    // uno de dentro de una región es de quien la tenga), si está en el muro
    // (`node`: se toma como un paso) y quién lo ocupaba (tarea 2, 05-11-2026).
    const delSitio = () => ({
      owner: sitio?.dueño ?? null,
      node: sitioEnUnNodo(state.map, o.id),
      occupiedBy: ocupanteView(sitio?.ocupante ?? null),
    });
    switch (o.kind) {
      // La obra del puesto, la que se recuerda: como el dueño, del objeto sabido.
      case 'node':
        return {
          kind: o.kind,
          id: o.id,
          at: o.at,
          owner: o.owner,
          upgrade: UPGRADE_DE_MEJORA[o.mejora],
          ...cuando,
        };
      case 'village':
        return { kind: o.kind, id: o.id, at: o.at, name: o.name, ...delSitio(), ...cuando };
      case 'town':
        return { kind: o.kind, id: o.id, at: o.at, ...delSitio(), ...cuando };
      case 'monster':
        return {
          kind: o.kind,
          id: o.id,
          at: o.at,
          creature: o.creature,
          count: o.count,
          defeated: o.defeated,
          ...cuando,
        };
      case 'chest':
        return { kind: o.kind, id: o.id, at: o.at, gold: o.gold, taken: o.taken, ...cuando };
      // Un lugar de un mundo: se ve, pero el agente aún no entra (F4); lo que
      // cambia en él —su estado— no viaja.
      case 'lugar':
        return { kind: o.kind, id: o.id, at: o.at, name: o.name, ...cuando };
    }
    // Exhaustivo: con un `kind` nuevo del mapa, `o` deja de ser `never`
    // aquí y esta línea NO compila. Y como termina en `throw`, el linter
    // ya ve que no hay camino sin salida y no hace falta callarlo.
    const sinSerializar: never = o;
    throw new Error(`objeto del mapa sin serializar: ${JSON.stringify(sinSerializar)}`);
  });
}

/**
 * El mapa **filtrado por la niebla de un jugador**: lo que responde la consulta
 * `map` (#74), que antes devolvía `state.map` tal cual, **y el `knownMap` de
 * cada `adventure_turn`** (#85). Los dos, desde aquí: si la tool le promete al
 * agente que trae lo mismo que el turno, lo mínimo es que salga de la misma
 * llamada. Igual que `knownObjects`, y por el mismo motivo — la copia se queda
 * atrás, que es exactamente lo que había pasado.
 *
 * No lleva anotación de retorno a propósito, y ningún serializador de este
 * fichero la lleva (#109): el tipo lo infiere el compilador y quien lo necesite
 * lo escribe donde lo usa (`ReturnType<typeof …>`), que es el mismo criterio con
 * el que se borraron los alias de `agent.ts`. Un `: unknown` obligaba a
 * `consultas.ts` a castear y a preguntar por los campos con cadenas.
 *
 * La capa es `fog` —«lo exploré alguna vez»— y no `visibleNow`, y el motivo es
 * que el terreno y los caminos **no cambian**: el recuerdo de un hecho estático
 * *es* el hecho, así que no lleva `lastSeen`. Los objetos sí cambian y por eso
 * siguen viniendo de `memory` con su fecha.
 *
 * **Una casilla sin explorar va como `null` en `terrain`**, no como hierba: el
 * índice sigue siendo `y * width + x`, igual que en `state.map.terrain`, y el
 * agente puede distinguir llanura de ignorancia. Al día 6 el 45,3 % de las
 * casillas serían mentira si se rellenaran con un terreno por defecto.
 *
 * `roads` solo trae las casillas exploradas. Su ausencia **no** significa que no
 * haya camino: lo desambigua el terreno de esa misma casilla, que si es `null`
 * quiere decir que ahí no se sabe nada de nada.
 *
 * **Y salen como `{x, y}`, no como la clave `"x,y"` con la que se guardan.** El
 * `Set<string>` de `GameMap.caminos.casillas` es cómo se preguntan los caminos,
 * no cómo se cuentan: lo que se filtraba a la red era el detalle de
 * almacenamiento. En este mismo contrato el agente **escribe** los caminos como
 * puntos —`mapPlanSchema.roads` es `z.array(pointSchema)`— así que leerlos como
 * cadenas era pedirle dos formatos para el mismo hecho, y era el único campo
 * del payload que no venía como `{x, y}`. Cuesta unos 800 B por cada 100
 * casillas con camino; a cambio se cae la advertencia que había que escribirle
 * al agente para que supiera leer el campo, que es un guardia que no existía.
 *
 * **Casillas y no tramos**, también desde que el mapa guarda tramos (#153): lo
 * que el agente necesita del camino es lo que cuesta pisar cada casilla, y eso
 * va por casilla. Los tramos son cómo se pinta.
 */
export function serializeKnownMap(state: GameState, playerId: PlayerId) {
  const player = playerById(state, playerId);
  const { width, terrain, caminos } = state.map;
  // Los asaltantes se ven AHORA o no se ven, como un héroe enemigo: se mueven
  // cada día, y un recuerdo de dónde estaban sería ruido con fecha. Por eso no
  // van en `objects`, que es memoria. Qué grupo se ve lo dice
  // `asaltantesALaVista` —si se mira su casilla—, la misma que pinta el cliente.
  const vistos = asaltantesALaVista(state, visibleNow(state, playerId));

  return {
    width,
    height: state.map.height,
    terrain: terrain.map((t, i) => (player.fog.hasIndex(i) ? t : null)),
    roads: [...caminos.casillas].map(pointFromKey).filter((p) => player.fog.has(p)),
    objects: knownObjects(state, playerId),
    raiders: vistos.map((r) => ({ id: r.id, at: r.at, troops: r.troops, strength: poderDe(r) })),
  };
}

/**
 * Lo que cuesta entrar en cada terreno, **resuelto llamando a `costeDeEntrada`**.
 *
 * Vino de `agent.ts` con el bloque de prosa al que pertenece, y sigue sin llevar
 * fórmula ninguna: **las dos columnas ya calculadas**, recto y diagonal, de modo
 * que el agente suma lo mismo que el motor sin multiplicar ni redondear. Si
 * mañana el camino deja de ser plano o el redondeo cambia a `floor`, estas
 * cifras cambian solas.
 *
 * Se recorre `SUELOS_PISABLES` y no `Object.entries`, que perdía el tipo de la
 * clave y obligaba a un `as`: es la lista de lo que se pisa, derivada con la
 * misma `isWalkable` que usa el pathfinding, así que el día que se navegue el
 * agua aparece sin que nadie se acuerde. Y el orden es por coste, estable sobre
 * el de declaración: ni un `localeCompare`, que sería la única comparación
 * sensible al idioma en un texto que tiene que ser el mismo en dos partidas
 * iguales.
 */
const COSTE_POR_TERRENO = SUELOS_PISABLES.map((t) => ({
  t,
  recto: costeDeEntrada(t, false, false),
  obl: costeDeEntrada(t, false, true),
}))
  .sort((a, b) => a.recto - b.recto)
  .map(({ t, recto, obl }) => `${t} ${recto} (${obl} en diagonal)`)
  .join(', ');

/**
 * Lo que no se pisa, **sacado de `BARRERAS`** y no escrito: la frase decía «el
 * agua y la montaña» a mano, y con tres barreras nuevas habría mentido por
 * omisión.
 */
const BARRERAS_EN_PROSA = BARRERAS.map((t) => `"${t}"`).join(', ');

/** Lo mismo para una casilla con camino: no depende del terreno que haya debajo. */
const COSTE_CON_CAMINO = `${costeDeEntrada('grass', true, false)} (${costeDeEntrada('grass', true, true)} en diagonal)`;

/**
 * **Cómo se lee lo que devuelve `serializeKnownMap`**, en prosa y una sola vez.
 *
 * Vive pegado al serializador porque el fallo que cierra es exactamente el de
 * añadirle un campo y olvidar la descripción: quien edite la función de arriba
 * tropieza con esto. Lo leen las **dos** puertas por las que sale ese objeto —
 * `RESPONSE_FORMAT.adventure_turn` (`formato.ts`) y la descripción de la tool
 * `map` (`mcp/server.ts`)— y hasta este ciclo eran dos prosas escritas a mano
 * que se citaban la una a la otra: «es lo mismo que viaja en knownMap» / «es lo
 * mismo que devuelve la tool map». #85 unificó el **dato** y las dejó
 * divergiendo en el mismo commit — la de la tool no tenía el agua, ni los
 * costes, ni el formato de los caminos, así que quien llamaba a la tool recibía
 * una descripción estrictamente peor del mismo objeto.
 *
 * Va en `core` y no en `notas.ts` por la frontera que aquel módulo declara:
 * `RESPONSE_FORMAT` **anuncia antes** y las notas **informan después**. Esto es
 * lo primero.
 *
 * **Sangrado dos espacios, y no es cosmético.** Las dos puertas lo introducen con
 * una línea que acaba en dos puntos, y en `RESPONSE_FORMAT` esa línea es una
 * viñeta más de una lista larga: sin la sangría, un `- "terrain"` se lee como un
 * campo de la raíz del payload y no como uno de `knownMap`. Cada puerta pone lo
 * suyo delante —que la tool se puede pedir sin esperar turno, que en el turno ya
 * lo tienes delante—, que es lo único que de verdad las diferencia.
 */
export const COMO_SE_LEE_EL_MAPA = `  Trae width, height, terrain[], roads[], objects[] y raiders[]:
  - "terrain" es un array plano de width×height casillas, indexado y*width+x: la
    casilla {x,y} está en terrain[y*width+x]. Un null NO es un tipo de terreno, es
    una casilla que no has explorado: ahí no sabes nada —ni el suelo, ni si hay
    camino, ni qué hay encima— y no vale suponer que es hierba.
  - El terreno se EXPLORA POR REGIONES: en cuanto un héroe tuyo entra en una
    región la descubres entera, con su borde y sus pasos, y sobre un nodo o una
    ciudad descubres todas las regiones que une. Empiezas con las de tu base.
  - Lo que pasa, en cambio, solo lo ves CERCA: en ${HERO_SCOUT_RADIUS} casillas
    alrededor de cada héroe tuyo y en ${NODE_SCOUT_RADIUS} alrededor de cada ciudad y cada
    nodo tuyos (un cuadrado), y solo sobre lo explorado. Fuera de eso no ves
    héroes, ni grupos, ni quién toma qué: lo sabes como lo viste por última vez.
  - "roads" son las casillas con camino que has explorado, como puntos {x,y},
    igual que los escribes tú en un plan de mapa. Que falte una NO significa que
    no haya camino: si el terreno de esa casilla es null, es que no lo has visto.
  - "objects" es lo que has OBSERVADO, no lo que es verdad ahora: cada objeto trae
    "lastSeen" con el día en que lo viste. Si "lastSeen" es anterior a hoy, el dato
    puede haber caducado —un nodo cambia de dueño y tú sigues viendo la bandera
    vieja hasta que alguien vuelva a mirar—.
  - El mapa es una RED: regiones cerradas por barreras —las que no se pisan, y
    se dicen más abajo—, y los "node", y las ciudades ("town") y los pueblos
    ("village") con "node": true, son los únicos pasos entre ellas. Un "node" se
    toma pisándolo, de camino o parando; una ciudad o un pueblo con "node": true
    está en el muro y se toma igual, venciendo antes su guarnición si la tiene.
    Una región es tuya cuando lo son TODOS los nodos que la rodean, y solo
    produce si además está unida a tu base por regiones y nodos tuyos. Una
    ciudad o un pueblo con "node": false está DENTRO de su región: no se toma,
    es de quien tenga la región ("owner", el que viste). Cada pueblo
    ${REGLA_DEL_PUEBLO}. Uno que deja de darte oro es que alguien te ha cortado
    un paso o te lo ha OCUPADO ("occupiedBy": un héroe o una guarnición de otro
    dentro; mira OCUPACIÓN). No hay minas ni más recurso que el oro.
  - Tu base ("yourBase") es la partida: si la pierdes quedas eliminado en el
    acto, aunque te queden héroes y ciudades. Lo mismo le pasa al rival. Las
    dos nacen con guarnición, así que tomarla es una batalla mientras le quede
    tropa dentro.
  - Cada ciudad ocupa un RECINTO amurallado de ${LADO_DEL_RECINTO}×${LADO_DEL_RECINTO} casillas con ella en el medio,
    y se entra por sus puertas: las de las caras a las que llega un camino (al
    norte, al sur o en las esquinas, nunca al este ni al oeste) y la del puente
    de una ciudad junto a un río. El resto de su recinto no se pisa aunque sea
    hierba: desde fuera se pasa de un acceso a la puerta y de la puerta a la
    ciudad. La puerta y la ciudad cuestan como un camino.
  - Un héroe enemigo, una ciudad ajena con guarnición o un paso o un pueblo
    con guarnición ajena se alcanzan pero no se cruzan: pedirlos de destino es
    pedir la batalla, y un "move_hero" a otro
    sitio los rodea por otro paso si lo hay. Si no lo hay, no hay camino.
  - "raiders" son los grupos de ASALTANTES que ves AHORA, con su tropa
    ("troops") y su fuerza ("strength"). No son de nadie: viven en una región
    sin dueño y la patrullan, moviéndose cada día sin salir de ella ni pegarse a
    un nodo. Un grupo se ve solo si su casilla está cerca de un héroe, una ciudad
    o un nodo tuyos, como un héroe enemigo. Si uno no aparece no significa que no
    esté: puede patrullar fuera de tu vista la misma región que vas a pisar, y
    entonces te emboscará sin aviso. Se dispersan en cuanto su región tiene dueño, y cada lunes puede
    brotar uno nuevo en cualquier región sin dueño donde no haya nadie.
  - Un grupo de asaltantes EMBOSCA al héroe que pisa una casilla de su región
    si su fuerza pasa de ${String(MARGEN_CONTRA_NEUTRALES).replace('.', ',')} veces la del héroe
    ("heroes[].strength"): la marcha se para ahí y empieza una batalla que tú
    juegas DEFENDIENDO. Basta con pisar la región, no hace falta acercarse. Un
    héroe parado no se ataca. Con menos fuerza que eso no embosca, y tú puedes
    atacarlo pidiendo su casilla de destino: como un héroe enemigo, se alcanza
    pero no se cruza.
  - Con "terrain" y "roads" eliges la ruta antes de andarla, en vez de descubrirla
    al pisarla:
    - ${BARRERAS_EN_PROSA} NO se cruzan, salvo un héroe que se infiltra
      ("heroes[].infiltrates"), a un día entero de marcha por casilla. No hay
      barcos ni puertos de montaña: para todos los demás una casilla de una de
      ellas no es un atajo caro, es un muro, y un destino al otro lado obliga a
      rodearla o, si separa dos regiones, a pasar por un nodo.
    - Entrar en una casilla cuesta esto en puntos de movimiento, y la cifra entre
      paréntesis es la que se cobra si entras en diagonal —las dos son ya el precio
      final, no hay nada que aplicarles—:
      ${COSTE_POR_TERRENO}.
    - Si la casilla tiene camino cuesta ${COSTE_CON_CAMINO} sea cual sea su suelo,
      y por eso un rodeo por carretera sale a menudo más barato que la línea
      recta por el barro. Un camino solo está en casillas que se pisan: nunca
      atraviesa una barrera, salvo por la puerta de una ciudad.
    - Compáralo con los puntos de movimiento que le queden hoy al héroe
      ("movePoints") para saber hasta dónde llegas.`;
