# El camino cuesta: distancia entre bases y asaltantes de caminos

## Petición literal

Con «perder la base elimina», las partidas eran carreras: la mediana es de 4-5
días porque la IA asalta la base rival. Se le preguntó al usuario cómo frenarlas, y
respondió:

> «Mas distancia entre bases, que de tiempo a mejorar tropas, tomar fortines...
> Que haya grupos autonomos como asaltantes de caminos y no sea tan facil moverse,
> de forma que si vas directo a por la base enemiga llegas con poca gente y cuando
> el contrario ya la ha fortificado»

Sus decisiones:

- **Asaltantes: «Patrullan su región».** Cada grupo vive en una región sin dueño,
  se mueve por ella cada día y ataca a los héroes que entran si se cree capaz. **No
  cruzan nodos.** Desaparecen cuando la región pasa a tener dueño.
- **Reaparecen: «Sí, en regiones sin dueño».** Cada semana puede surgir un grupo
  nuevo en una región neutral: el mapa sin conquistar nunca es seguro.
- **Distancia: «Que lo decida la medida».** Se prueban tamaños y se elige el que dé
  partidas de duración razonable con los asaltantes ya puestos.

Contexto: `NuevaJugabilidad.md` (fuente viva, léelo) y el plan general,
`~/.claude/plans/lo-has-entendido-perfectamente-fizzy-flask.md`.

## Criterios de aceptación

1. **Asaltantes de caminos.** Son un tipo nuevo de grupo neutral en el mapa,
   individuos con el tope de 7, que **patrulla su región**:
   - cada día se mueve por ella, sin cruzar nunca un nodo;
   - **ataca** a un héroe que esté en su región si se cree capaz, con la misma
     regla de fuerza que use la IA;
   - si no se cree capaz, lo evita o se queda quieto (lo decide el diseño).

   Todo pasa por `createRng`, así que la partida es reproducible. La batalla es la
   de siempre: el héroe defiende y su bando la juega quien lo lleve (persona,
   agente o IA, sin rendirse por otro).
2. **Desaparecen** cuando su región pasa a tener dueño (`territorio(state)`).
   **Reaparecen** cada semana en regiones sin dueño, con una probabilidad y una
   composición provisionales en datos (declaradas inventadas). La reaparición
   nunca coloca un grupo sobre un héroe, un nodo o un objeto, ni en una región
   donde hay un héroe en ese momento: no aparecen encima de nadie.
3. **El generador pone asaltantes al empezar** en las regiones neutrales.
   `validateMapPlan` los acepta en los planes del agente (`map_generate`), con su
   validación y su prosa. Un plan sin ellos es válido.
4. **Más distancia entre bases**, elegida midiendo. Se prueban varios tamaños de
   mapa con los asaltantes puestos y se publica, por tamaño:
   - duración (mediana, p90, máximo);
   - partidas sin terminar (tienen que ser 0);
   - ganador y tiempo de `pnpm banco`;
   - asaltos a la base por día de partida.

   Se elige el que dé una duración razonable (orientativo: mediana ≥ 8-10 días, con
   la cola acotada) y se razona la elección. **El banco juega el tamaño elegido.**
5. **«Llegas con poca gente».** Se mide y se publica la tropa con la que llega un
   héroe a la base rival: hoy frente a después. El objetivo es que ir directo cueste.
6. **La IA juega con ellos.** No suicida a sus héroes contra asaltantes más
   fuertes, y los limpia o los rodea cuando le conviene. Lo bastante para que las
   partidas terminen: barrido 0/40 y 0/1000.
7. **El agente los ve.** Aparecen en su turno y en la consulta `map`, filtrados por
   la niebla, con su movimiento contado en la crónica cuando le toca verlo.
   `pnpm qa` se encuentra con alguno.
8. **El cliente los pinta y anima** como grupos (con figura del maniquí o del arte
   que haya), y su movimiento diario se ve. `pnpm capturas` lo comprueba.
9. **Banco re-anclado UNA vez**, mirando la forma: qué hechos son nuevos, que
   ninguno es imposible y que las partidas terminan. `pnpm verify`, `pnpm qa` y
   `pnpm capturas` en verde.

## Fuera de alcance

- **Fortificaciones** construidas por el jugador, murallas y bonificación al
  defensor: van a la fase 3.
- **La 2b**: oro, piedra y madera; territorio en el cliente y para el agente.
- **La IA buena** (#115).
- **Desgaste de guarnición**: descartado por ahora.

## Contexto del coordinador

- **Estado de `main`**: commit `96a1de5`, banco `2a836460…`, 641 tests.
- **Regla vigente**: quien defiende con su héroe dentro libra la batalla final.
- **Medidas anteriores**: el ×3 a la base rival se queda, por medida. Sin él, la
  cola llegaba a 80 días. Si los asaltantes cambian eso, se vuelve a medir.
- **Pathfinding**: `frontera.ts` y su contrato de desempate se respetan. Lo hostil
  se alcanza y no se cruza; un asaltante es hostil.
- **Rendimiento**: `pnpm banco` tarda ~2,1 s. Un mapa mayor lo alarga: se publica
  el tiempo nuevo y, si se dispara, se decide midiendo.
- **Arte**: hay una sesión de arte trabajando en `/home/al/code/heroes-arte`
  (rama `arte`). No se toca nada de esa carpeta. El arte de los asaltantes, si
  hace falta, se pide en su `docs/art/peticiones.md`.

## Decisiones del usuario sobre el plan (02-10-2026)

- **Plan aprobado** (opción B: el asaltante es un actor, no un objeto del mapa, y
  embosca como atacante). El tamaño del mapa se elige con la regla medida: el
  menor con mediana ≥ 8, p90 ≤ 20 y 0 sin terminar en 1 000 semillas. El
  prototipo dice 32; se vuelve a medir con la implementación real. El banco a unos
  6 s está aceptado. Los asaltantes tienen un **techo de fuerza en datos**, y un
  test lo vigila.
- **Criterio 5 reinterpretado y aceptado.** Que la IA ya no vaya directa (rodea,
  y llega más tarde y más fuerte) cuenta como «si vas directo llegas con poca
  gente». Se publican la tropa al llegar y los asaltos a la base por día; no se
  exige que la tropa baje.
- **También en casa: «No, también en casa».** CORRIGE el default del plan: **no
  se excluyen** las regiones que tocan una base. Pueden nacer y reaparecer
  asaltantes en la región de casa, y hay que limpiarla antes de expandirse. Se
  mantienen las garantías del criterio 2: nunca aparecen encima de un héroe, un
  nodo o un objeto, ni en una región donde hay un héroe en ese momento. Se mide
  el efecto en los primeros días (emboscadas el día 1 o 2, héroes perdidos
  pronto) y se publica.
