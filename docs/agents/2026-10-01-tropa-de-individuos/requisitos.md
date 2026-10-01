# Tropa de individuos con liderazgo, y el héroe en el tablero — fase 1

## Petición literal

De `NuevaJugabilidad.md` (1-10-2026), del usuario:

> «Los heroes van por separado, como en el Heroes of Might and Magic (HMM)»
> «Llevan una tropa que viene limitada por sus puntos de liderazgo, que marcan el
> maximo de puntos que tienen para reclutar tropa»
> «Cuando muere la tropa se pierde, cuando muere el heroe o se rinde vuelve a la
> base. Ahi puede reponer la tropa pero pierde el terreno avanzado. Solo hay una
> base […]»

Y sus respuestas en la conversación:

- La tropa en batalla: **«Individuos, uno por hex»**. La vista previa que eligió:
  `Liderazgo 30: Caballero (espada+escudo) 8, Caballero (mandoble) 8, Monje 6,
  Ballestero 4 × 2 → 30/30. En batalla: 5 hexes, 5 individuos`.
- El héroe en batalla: **«En el tablero»**. Ocupa un hex, pelea y puede caer.
- Sobre volver a la base: «Simplemente que vuelve a la base. El problema es que el
  territorio conquistado se queda sin ese heroe […] mantener los territorios
  cercanos a la base sea mas facil que los mas alejados».
- Transición: **evolucionar en sitio**. El banco se re-ancla a propósito.
- Economía: **«Lo defino yo después»**. Se planifica con una provisional en datos.

Plan general: `~/.claude/plans/lo-has-entendido-perfectamente-fizzy-flask.md`.
Léelo: esta es su fase 1.

## Criterios de aceptación

1. **Ejército de individuos.** El ejército de un héroe es una lista de unidades,
   cada una `count: 1`. Desaparece el tope de 5 slots (`MAX_ARMY_SLOTS`) y la
   fusión de `addToArmy`. Reclutar N unidades de un tipo añade N individuos.
2. **Liderazgo.** Cada tipo de unidad tiene un coste de liderazgo en
   `data/creatures.json`. Cada héroe tiene `leadership`. Reclutar o recibir tropa
   por encima del liderazgo **lanza** con una frase para la persona (`no cabe: el
   ejército ocupa 28 de 30 de liderazgo y un caballero pide 8`). Valores
   provisionales en datos, más una regla provisional de crecimiento con el nivel.
3. **Despliegue de N unidades.** `createBattle` coloca a todos los individuos de
   cada bando sin solaparlos y lanza si no caben. Hoy, a partir del sexto se
   solapan sin aviso.
4. **El héroe es una unidad en el tablero**, con su perfil de combate, reutilizando
   lo de la fase 2 (`member` y `combatProfile`). Si cae, su bando **pierde la
   batalla** aunque le quede tropa. Su magia sigue funcionando mientras esté vivo,
   como hoy.
5. **Rendición.** Nueva acción de batalla `surrender`: el bando que se rinde pierde
   y su héroe vuelve a la base. La puede elegir el jugador, el agente y la IA de
   reglas (con una regla sencilla, decidida por el arquitecto).
6. **El héroe derrotado vuelve a la base.** No se borra de la partida. Reaparece en
   la base de su dueño con el ejército vacío y sin movimiento ese día. La tropa
   muerta se pierde. Provisionalmente, la base es el castillo inicial del jugador.
   Si no la conserva, el comportamiento es el de hoy, y la fase 3 decide el resto.
7. **Monstruos neutrales.** También son individuos. Un monstruo del mapa no puede
   tener más unidades de las que caben en su lado del tablero; el generador y
   `validateMapPlan` lo respetan.
8. **Todos los lectores del ejército conocen la tropa nueva**, incluido un héroe
   que es `member`: `slowestSpeed`, `armyPower`, `armyView`, `views/panels.ts`,
   `ws-server.ts`, reclutamiento, IA estratégica y serialización. Un héroe con
   tropa **pasa de día** sin lanzar. Esta es la issue pendiente de la fase 2.
9. **El juego se juega entero.** La IA contra la IA: el barrido de semillas da 0
   partidas sin terminar. En el navegador, una partida desde el inicio contra la
   IA, con reclutamiento, batallas de varios individuos con el héroe dentro y una
   derrota que devuelve al héroe a la base. Sin arte nuevo: marcadores de color.
10. **El banco se re-ancla a propósito.** El nuevo sha se fija tras comprobar la
    forma del cambio en el volcado: las partidas terminan, aparecen los hechos
    nuevos (vuelta a la base, rendición) y no hay hechos imposibles. `pnpm
    verify` y `pnpm qa` en verde. El contrato del agente refleja la tropa nueva:
    esquemas, `RESPONSE_FORMAT` y la acción `surrender`.

## Fuera de alcance

- Nodos, regiones, territorio, fortificaciones, guarniciones en nodos: fases 2 y 3.
- Base única formal, victoria por tomar bases y N facciones: fases 3 y 4.
- Los cinco ejércitos y el equipo (escudo, mandoble): fase 4. Aquí se usan las
  criaturas de hoy como individuos.
- Narrador, taller de imágenes y arte nuevo.
- La economía definitiva: la define el usuario.

## Contexto del coordinador

- La fase 2 está commiteada en `d9a96a7`: `BattleStack.unit`, `body`,
  `Stack.member`, `Character`, `combatProfile`, `woundsFromBattle`. Aplazado
  entonces y que encaja aquí: `Stack` como unión discriminada
  (`{creature, count} | {member}`), con resolución a nivel de `Army` y vuelta
  simétrica (ver `docs/agents/2026-09-30-el-personaje-pelea-solo/hallazgos-simplify.md`,
  «Se aplazan»). Con `count` siempre 1, la unión puede simplificarse: decide el
  arquitecto.
- El héroe hoy tiene `attack`, `defense`, `spellPower` y `knowledge`, que suman a
  todas sus unidades. Al estar en el tablero, cómo se reparten esos números entre
  bonificación y su propio perfil es una decisión de diseño. Recomendación por
  defecto: el héroe tiene un perfil propio de unidad (atributos) y deja de
  bonificar a la tropa, salvo lo que decida el arquitecto con un motivo.
- `experienceFor` cobra +500 por héroe rival derrotado. Se mantiene: derrotarlo
  sigue valiendo aunque reaparezca.

## Decisiones del usuario sobre el plan (01-10-2026)

- **Se parte en dos ciclos**, cada uno con commit, banco re-anclado y QA:
  **1a la tropa** (criterios 1, 2, 3, 7, 8) y **1b el héroe** (4, 5, 6). El 9 y el
  10 se cumplen en los dos. Este ciclo ejecuta **solo 1a**.
- **Rendición: conserva la tropa superviviente y PAGA ORO** (como en HoMM, coste
  proporcional a la tropa que salva). Corrige la opción por defecto del plan
  («gratis»): aplica en 1b.
- **Derrotar a un héroe en su propia base conquista la base**: aceptado.
- **El héroe entra sano a cada batalla** (perfil propio, sin heridas persistentes,
  no es `Character`): aceptado; heridas y curación del héroe van a issue.

## Regla nueva para 1b (usuario, 01-10-2026)

> «Los heroes llevaran maximo 6 personajes mas.»

Confirmado con el usuario: **todo bando ≤ 7 individuos**. Un héroe = él + como
mucho 6 de tropa; los **monstruos del mapa y las guarniciones** (de castillos y,
en la fase 3, de fortificaciones) también, como mucho 7. El liderazgo sigue
decidiendo QUÉ cabe dentro de esos 6. Se implementa en **1b**, junto al héroe en
el tablero, con su re-anclaje del banco; `validateMapPlan`, el generador,
`recruitCapacity` y `takeGarrison` lo respetan, y el rechazo se dice con frase.

## Decisiones del usuario sobre plan-1b.md (01-10-2026)

- Plan de la 1b aprobado.
- **El héroe deja de bonificar a la tropa** y pelea con su propio cuerpo: «Sí,
  solo su cuerpo». Las bonificaciones volverán como habilidades de cada tipo de
  héroe (motor de habilidades, más adelante).
- **Precio de rendirse: 50 % del oro de la tropa superviviente**, provisional, en
  `data/heroe.json`, declarado inventado.
