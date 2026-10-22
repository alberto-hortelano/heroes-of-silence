**REENCUADRADA (vuelta 2, 22-10-2026)**. El sistema que pide el usuario es el encuadre correcto: el
formato del «mundo» es el contrato entre el motor y el juego. Pero la F1 que se propone es dos ciclos,
no uno. Se parte en **F1a**: el mundo con sus lugares, escrito por el motor y jugable. Y **F1b**: la
gente de la base, cuando haya entrado *heroe-en-la-base*. Hay que cerrar siete decisiones antes del
arquitecto. La vuelta 1 queda debajo, en lo que sigue valiendo.

## El problema real, en una frase

El mapa procedimental no tiene nada con historia. Y no existe ninguna vía para que un motor de
narrativa escriba sobre ese mapa lugares, gente y consecuencias que el núcleo valide y el juego
juegue sin él.

## La premisa de la vuelta 2, comprobada

| Afirmación (o supuesto) | Verificación |
|---|---|
| «Un mundo = semilla + lugares» | **Frágil.** El mapa de una semilla cambia con casi cada ciclo del generador: «otro vestido» y «otro mapa» se repiten en `CLAUDE.md`, y el banco se ha reanclado decenas de veces. Un mundo atado a la semilla se rompería en silencio cada semana. El plan procedimental entero es un JSON de **27 KB** (s7, 103 ms, medido hoy). `newGame({ plan })` ya lo acepta (`state/setup.ts:41,177`), y `validateMapPlan` + `buildMap` lo rehacen sin generar nada. |
| El motor «lee el mapa» con lo que ya hay | **Solo a medias.** `serializeKnownMap` (`contract/serialize.ts:310`) es una rejilla de casillas pasada por la niebla de **un** jugador. Sirve para mover un héroe, no para saber dónde tiene sentido un lugar. Lo que sí sirve ya: `MapRegion` lleva nombre y nivel (`map/map.ts:85`), `estructura` da las vecinas (`map/regiones.ts:288`), el plan trae las ciudades con su facción, los pueblos con su nombre y el río, y `pnpm taller escenario <semilla>` pinta el mapa a PNG (`tools/taller/trabajador.ts:1129`), que Claude Code puede mirar. Falta una lectura por regiones y la lista de casillas que admiten un lugar. |
| `map_generate` es «el motor encima del procedimental» | **No.** El agente escribe el plan **entero** desde cero (`server/mapa-del-agente.ts`) y, si falla, juega el procedimental. Lo nuevo es lo contrario: el plan lo hace el procedimental y el motor solo añade. Se reusa el patrón (lista de problemas, sin reintento), no la petición. |
| `?mundo=` encaja en el arranque | Hay que tocarlo. `hayQuePreguntar` mira solo `seed`, `faccion` y `heroe` (`client/semilla.ts`): con solo `?mundo=`, la página abriría el menú. La regla de H5 obliga además a que un mundo roto pinte su motivo (`arranque.ts`), como un catálogo roto. |
| ¿Va al build? | Puede ir sin coste. `assets/` es la carpeta pública y `copiarPublico` deja fuera solo `fuentes/`, `_guias/` y `art/` (`tools/build/publico.ts`). Un JSON de `data/` que se carga con un `import()` va en su propio trozo. Los encargos y los crudos del arte, en `fuentes/`, quedan fuera solos. |
| El banco | **No lo ve, y no debe.** `pnpm banco` juega `newGame({ seed })` procedimental. Mientras el procedimental no lleve lugares, el banco no cambia, y eso prueba que nada se movió. Una partida de un mundo se reproduce con el fichero del mundo, no con la semilla. |
| Hay reglas para los premios | Sí. Oro: `player.oro +=` con `gold_gained` (el cofre, `state/game.ts:2162`), y pagar, con `oroBlocker` (`town/town.ts:136`). Pieza: `aLaMochila`, con `loot_found` (hoy solo `from: 'raider' \| 'town'`, `game.ts:3031`), y quitarla, con `sacarDeLaMochila` (`hero/equipo.ts:607`). Tropa: `troopBlocker` + `withTroops` (`hero/troop.ts:166,191`). Batalla: `dejarPendiente` → `createBattle` (`game.ts:2557`), con `ejercitoDe` para escribir el rival. |
| «Recluta único con nombre» | **No existe.** `Troop` no tiene nombre (`types.ts:357`): un veterano es anónimo y el personaje con nombre es el perfil RPG (`rpg/character.ts:65`, raza y profesión), otra cosa. |
| Un objeto nuevo del mapa | Cuesta lo que un `village`: **12 ficheros** lo nombran (serialización, `adaptar.ts`, IA, render, escenógrafo, recinto, renta). Un `BattleFoe` nuevo se paga en `battle_started`, `settleBattle`, `applyDefenderSurvivors` y el contrato (`pnpm qa`). |
| «El motor en vivo» | **Para la persona, no hay camino todavía.** `pnpm dev` juega en el navegador con `controllers: { 0: 'human', 1: 'ai' }` (`session.ts:915`). El agente solo vive en `pnpm partida`, y allí la persona solo mira. Para que el motor escriba mientras **tú** juegas, el cliente tiene que jugar contra el servidor. Es la pieza más cara de todo el plan. |

**Sigue valiendo de la vuelta 1**: la gente de la base (`data/vecinos.json`, `vecinosDeLaBase`) es
presentación con respaldo determinista, y la conversación es una línea con «Seguir»
(`views/base.ts:98`), así que el árbol es nuevo. El encargado del `fort` no sale al empezar. La escena
lateral reutilizable es `DePie` más la cámara y la franja de la base, no `castillo.ts` con sus sitios.
Dónde está cada cosa en una escena lateral es de `shared/` y el núcleo no lo lee.

## Las fases: juicio de la propuesta

La secuencia es razonable y el orden F2 (arte) antes que F3 (rejilla) es el bueno. Tiene cuatro fallos:

1. **La F1 es demasiado grande**: formato, validación, un objeto del mapa, una escena nueva, el árbol,
   un `BattleFoe`, la carga, la herramienta del motor, cinco personas de la base y un primer mundo son
   del orden de dos morada-vuelta-2. Además, la gente de la base choca de frente con
   *heroe-en-la-base*. Se parte en dos, y cada mitad es jugable de punta a punta.
2. **Falta la IA de reglas en los lugares.** Sin ella no es «lo general en lugar de recoger recursos»:
   el rival no tiene lo que tiene la persona. Va con F3 o como fase propia.
3. **F4 son dos cosas.** **F4a**: el motor en vivo en `pnpm partida` (el agente juega y añade lugares a
   media partida; se ve en el espectador). Es barato, porque el contrato ya existe. **F4b**: la persona
   juega contra el servidor, con narrador y texto libre. Es la pieza más cara (ver la premisa). Si F4b
   no se hace nunca, «las dos» queda en «el motor antes de jugar» para la persona.
4. **No cerrar la puerta de F4.** Lo que el mundo define entra en `GameState` en `newGame` (sus lugares,
   su gente, sus árboles), no en un módulo estático que lea el cliente. Así, quien escriba en vivo
   añade al estado y el espectador lo recibe serializado.

Fases propuestas:

- **F1a · El mundo con lugares.** Lo concreto, abajo. Sin gente de la base y sin arte nuevo.
- **F1b · La gente de la base.** Una persona siempre presente por facción, con su árbol (el respaldo
  del repo). El mundo puede sustituirla (el padre anciano). Consejos derivados de la partida (tu arma,
  quién dispara). Va después de que entre *heroe-en-la-base*.
- **F2 · El arte bajo demanda con Codex.** Los encargos del mundo (exterior en el mapa, interior,
  objetos, personajes y sus clips) van a la cola del taller por la suscripción. La pieza del exterior
  toca `escenario/colocar.ts` (lo más frágil del cliente): pide su propio guardia de reserva.
- **F3 · Combate en el sitio y entrenamiento.** La rejilla sobre el fondo, el despliegue según dónde te
  pillan y la pelea sin bajas (regla nueva). Va después de la rueda 3/5/7 y del clima. Aquí o en una
  F3' entra **la IA de reglas visitando lugares**.
- **F4a / F4b**, como arriba.
- **F5 · El mapa que reacciona.** Estados que cambian solos, reputación, lugares conectados (las
  banderas de F1a ya los permiten a mano) y el día y la noche, que *clima* manda al backlog.

## La F1a, concreta y jugable de punta a punta

1. **El formato del mundo**, en `data/mundos/<id>/`: el plan congelado (P1), las facciones (P2), los
   lugares (exterior en una casilla del mapa, interior como escena lateral con sus puntos de interés),
   la gente de cada lugar, los árboles de diálogo con condiciones y efectos del vocabulario de abajo y
   los encuentros. El texto libre va solo en lo narrado (nombres, líneas, descripciones).
2. **La validación en `core`**: una función pura devuelve la lista entera de problemas, cada uno escrito
   para el motor (qué, dónde, qué vale), como `validateMapPlan`. La carga lanza con todos y la página
   pinta el motivo (H5). Lo que el motor no puede comprobar se deriva: si la casilla admite un lugar
   (`lugarBlocker`: pisable, en una región, fuera de recintos, puertas y reservas de otro objeto), si un
   árbol llega a todos sus nodos y si cada efecto apunta a algo que existe.
3. **El objeto `lugar` en el mapa**: se ve, se marca en la barra («El pozo de Valdesombra») y se entra al
   **acabar la marcha** en él (no al pasar, como el cofre). Lleva el arte que ya hay (P5) o un marcador.
   La IA de reglas y el agente lo ignoran (deuda declarada).
4. **La escena del lugar**: una escena lateral sin rejilla. El fondo es un tramo de plaza de una base, o
   un marcador. Por ella se anda, y en cada punto de interés se habla, se examina o se coge.
5. **La conversación en árbol**: elecciones, cada una con su condición. Una opción que no se cumple sale
   apagada con su motivo, que escribe el núcleo. Cada efecto lo aplica una acción del núcleo por
   `session.ts`.
6. **El encuentro**: la batalla de siempre, con un `BattleFoe` nuevo. Al acabar se vuelve a la escena, y
   se aplican los efectos de ganar o de perder.
7. **El estado del lugar persiste en la partida** (no hay guardado: «Cargar partida» sigue apagado). Lo
   que cambia la partida va a la crónica.
8. **El motor escribe un mundo**: una skill del repo (`.claude/skills/`) más dos órdenes. **«Leer el
   mapa»** congela el plan de una semilla y da sus regiones con nombre, suelo, nivel, vecinas, dueño de
   salida y ciudades, sus pueblos, el río y las casillas que admiten un lugar, junto con el PNG del
   taller. **`pnpm mundo validar <id>`** usa la misma función del punto 2. Un primer mundo, escrito así
   por Claude Code, con dos lugares cortos: uno con diálogo y premio, y otro con diálogo y batalla.
9. **`pnpm dev ?mundo=<id>`** lo juega sin agente. `?seed=` y `?faccion=` junto a `?mundo=` se rechazan
   diciéndolo, porque el mundo trae los suyos.

Queda fuera de F1a: la gente de la base, el arte nuevo, la rejilla, la IA de reglas, el agente, el
recluta con nombre, el texto libre y un menú de mundos (basta la URL).

## Vocabulario cerrado mínimo (F1a)

Condiciones (una lista es un «y»; `no` niega una):
- `estado: <id>`: el estado de este lugar. **Regla nueva**: `GameState.lugares`.
- `marca: <id>`: una bandera del mundo que puso un efecto. Permite cadenas sin código. **Regla nueva.**
- `oro: n`: se tiene al menos n. Responde `oroBlocker`.
- `lleva: <pieza>`: puesta o en la mochila. Responden `equipoPuesto` y la mochila.
- `faccion: <id>`: la de quien juega. Responde `esFaccion`.

Efectos:
- `estado: <id>` y `marca: <id>`. Escriben un hecho en la crónica (nuevo).
- `oro: ±n`. Ganar: `gold_gained`. Pagar: con `oroBlocker`, como precio de la opción.
- `pieza: <id>` y `quitar: <pieza>`. `aLaMochila` y `sacarDeLaMochila`; `loot_found` con `from: 'lugar'`.
  Se valida con `piezaBlocker` y el catálogo.
- `tropa: { unidad, n }`. `troopBlocker` es su condición implícita (la opción se apaga con su motivo).
- `batalla: <encuentro>`. El encuentro son grupos de tropa del catálogo (`ejercitoDe`), con `alGanar` y
  `alPerder`, que son listas de efectos sin otra batalla. Pasa por `createBattle` con el
  `BattleFoe` `lugar`.

La navegación del árbol (`ir`, `fin`) es del diálogo, no un efecto. Sin azar en F1a. Si hiciera falta
(el cubo del pozo), sería un `sorteo` con su propia corriente derivada, como `repartirBotin`.

## El día después (F1a hecha)

- **Para quien juega**: un mapa con dos sitios con historia, escritos para ese mapa. **Para el
  usuario**: un mundo nuevo es una conversación con Claude Code y un `validar`, sin ciclo de código.
- **Se vuelve más difícil**: el formato. Cada palabra del vocabulario es una regla que hay que mantener
  en el núcleo, en la validación, en la skill y, en F4, en el contrato. Por eso se empieza corto.
  También: cada `MapObject` y cada hecho nuevos se pagan en la serialización, `adaptar.ts` y `pnpm qa`.
- **Se cierra**: el mundo con el plan congelado no mejora con el generador. Rehacer un mundo es
  reescribirlo, aunque su texto se puede reusar.
- **Lo que nadie borrará**: una segunda lista de «personas que hablan». La gente de un lugar y la de la
  base (F1b) tienen que ser la misma forma que `Vecino`, ampliada, no otra.

## Conflictos (actualizados)

- **heroe-en-la-base** (crítica hecha, sin código): escribe en `render/base/escena.ts:44`, en la unión
  `Scene`, en `Session.vecinosDeLaBase` (`session.ts:1486-1520`) y en `inicio/`. Por eso F1b va
  **después** de ella. F1a solo comparte con ella la unión `Scene` (una escena más) y `inicio/`, si
  hay menú de mundos (no lo hay).
- **clima** (crítica hecha): manda el día y la noche al backlog y avisa de que las condiciones de un
  lugar querrán leer el tiempo en `core`. F1a no lleva condición de tiempo. Para que clima se enchufe
  igual en la base, la morada y el lugar, la escena del lugar debe pintarse por el mismo
  `dibujarFotograma` (`main.ts:359`) que ellas.
- **complejidad del combate** (plan hecho): añade parámetros en `inicio/inicio.ts` (`jugar`) y en
  `data/liderazgo.json` (`topesPorBando`). `?mundo=` debe convivir con sus parámetros, o el mundo los
  fija. El tamaño de un encuentro lo limita el tope de la tropa: el validador lo lee de allí, no de una
  cifra propia. Choque en `inicio/` y `semilla.ts`: el orden da igual si cada una añade su parámetro sin
  reescribir `hayQuePreguntar` entera.

## Coste contra valor

F1a es un ciclo grande pero de un solo eje, y deja el sistema probado con el motor real. F1b es un
ciclo mediano. No hacerlo deja el «solo oro» sin sustituto. Hacer la F1 de una vez cuesta lo mismo y
pelea con otra sesión por la base.

## Decisiones que el usuario cierra ANTES del arquitecto

**P1 · Qué guarda el mundo del mapa.**
- A) El plan congelado (27 KB) más la semilla de la escena. El mapa no se mueve aunque cambie el
  generador. *(Recomendada.)*
- B) La semilla y una huella del plan. Con cada cambio del generador el mundo deja de valer y lo dice.
- C) Solo la semilla. El mapa cambia en silencio y los lugares caen en una montaña. *(No.)*

**P2 · Las facciones de un mundo.**
- A) El mundo fija las dos (y, si quiere, el héroe). La historia se escribe para ellas. *(Recomendada.)*
- B) Quien juega elige facción y el mundo se escribe para cualquiera, con condiciones por facción.
  Cinco veces el texto.

**P3 · Dónde puede ir un lugar.**
- A) En cualquier casilla que admita `lugarBlocker`, sin camino nuevo hasta él. *(Recomendada.)*
- B) Solo en el sitio de un pueblo, al que sustituye. Ya trae su camino, su puerta y su arte, pero da
  menos libertad.
- C) Donde quiera, con el camino trazado hasta él. Toca el trazado del generador. *(No.)*

**P4 · La IA de reglas y el agente ante los lugares.**
- A) No entran hasta F3. El rival no los usa (deuda declarada). *(Recomendada.)*
- B) La IA entra ya en F1a con una regla simple (la primera opción). Mueve las partidas de los mundos,
  no el banco.

**P5 · Con qué se ve un lugar en F1a, sin arte nuevo.**
- A) Fuera, una variante de la hoja de pueblos; dentro, un tramo de plaza de una base de su facción.
  *(Recomendada.)*
- B) Marcadores fuera y dentro: lo más barato, pero se ve como un prototipo.

**P6 · Los mundos y el build.**
- A) Van al build como datos del repo (pocos KB; sus crudos de arte, en `fuentes/`, no).
  *(Recomendada.)*
- B) Solo en `pnpm dev`.

**P7 · El premio de tropa en F1a.**
- A) Unidades del catálogo, sin nombre. *(Recomendada.)*
- B) Un veterano con nombre (Corvo). Hace falta un nombre en `Troop`, con su serialización y su panel.
  Coste moderado.

## Qué le cambiaría a `requisitos.md` (para pegar)

> **Fase 1a: el mundo con lugares.** Un *mundo* es un paquete en `data/mundos/<id>/`: el plan del mapa
> (P1), sus facciones (P2), lugares, gente, árboles de diálogo y encuentros. Lo valida una función
> pura de `core`, que da todos los problemas escritos para el motor. La carga lanza con ellos y la
> página dice por qué. Su contenido entra en `GameState` en `newGame`. Criterios:
> 1. `pnpm mundo validar <id>` y la página aplican la misma validación. Un mundo roto no arranca y dice
>    qué está mal y dónde.
> 2. Una orden del repo lee un mapa para el motor: regiones con nombre, suelo, nivel y vecinas, ciudades
>    con su facción, pueblos, río, las casillas que admiten un lugar y el PNG del taller. Una skill le
>    dice al motor cómo escribir el mundo. El primer mundo lo escribe Claude Code con ellas.
> 3. `pnpm dev ?mundo=<id>` juega ese mundo sin agente. Con `?seed=` o `?faccion=` al lado, se rechaza
>    diciéndolo.
> 4. Un lugar es un objeto nuevo del mapa. Se entra al acabar la marcha en él y se abre su escena
>    lateral. En ella se anda, se habla en árbol (las opciones que no se cumplen salen apagadas con el
>    motivo del núcleo), se encuentra algo y se pelea la batalla de siempre.
> 5. Las condiciones y los efectos son los del vocabulario cerrado de `critica.md`. Cada efecto lo
>    aplica una acción del núcleo. Lo que cambia la partida va a la crónica y lo narrado no.
> 6. Sin mundo, el juego es el de hoy: `pnpm banco` no cambia.
> 7. Ni la IA ni el agente entran en lugares (P4), y se declara. No hay arte nuevo (P5).
>
> **Fase 1b: la gente de la base**, después de *heroe-en-la-base*. Una persona siempre presente por
> facción, de la misma forma que `Vecino`, con árbol y consejos derivados de la partida. Un mundo
> puede sustituirla.
