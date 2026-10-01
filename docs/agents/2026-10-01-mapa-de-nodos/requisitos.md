# Fase 2: el mapa es una red de nodos que encierra regiones

## Petición literal

La fuente viva es `/home/al/code/heroes/NuevaJugabilidad.md`, que el usuario va
completando. **Léelo entero.** Lo que toca a esta fase:

> «El mapa es una red con nodos, los nodos son puntos de paso, lo que queda dentro
> es tambien navegable pero los nodos delimitan los accesos, tiene que asegurarse
> asi de forma programatica.»
> «El objetivo es ir conquistando territorio, todo lo que queda encerrado por nodos
> controlados por una faccion le da los recursos, si no esta encerrado por ninguna
> no da recursos.»
> «Los recursos son: oro, piedra, madera.»
> (Ciudades) «Las ciudades son nodos de la red, igual que los pueblos, pasan a ser
> puntos fuertes de la red: controlan accesos, forman parte de los límites de las
> áreas y hay que tomarlas para avanzar. […] los pueblos y recursos están dentro de
> las áreas y cambian de dueño por encierro, y las ciudades son nodos y cambian de
> dueño por conquista.»
> «El generador de mapas tiene que colocarlas bien […] Que estén en nodos de grado
> alto (3 o más conexiones) […] Que haya varios caminos entre cada base y las
> ciudades cercanas, para que el aislamiento sea posible pero no trivial.»

Decisiones del usuario en la conversación:

- **Interpretación del mapa, confirmada («Sí, exacto»).** Las regiones están
  separadas por terreno infranqueable (montaña, río, bosque espeso). Los únicos
  accesos entre regiones son los nodos. Dentro de una región uno se mueve libre. Si
  controlas **todos** los nodos que rodean una región, sus recursos son tuyos.
- **«Conectado a la base»** significa que hay una **cadena de regiones y nodos
  propios** desde la base. Cortar un nodo desconecta lo que hay detrás.
- **La base es una ciudad-nodo más**, la única donde se reaparece.
- **Una ciudad aislada sigue siendo de su dueño y no produce. Sin desgaste de
  guarnición por ahora** («probaremos primero sin desgaste»).
- **Evolucionar en sitio**: el banco se re-ancla a propósito, mirando antes la forma
  del diff.

Plan general: `~/.claude/plans/lo-has-entendido-perfectamente-fizzy-flask.md`.

## Criterios de aceptación

1. **El mapa tiene regiones y nodos, y la estructura se demuestra.**
   `MapPlan`/`GameMap` declaran los nodos. `validateMapPlan` lo **comprueba
   programáticamente**:
   - quitando las casillas de nodo, las componentes transitables son las regiones;
   - toda adyacencia entre dos regiones distintas pasa por un nodo;
   - cada región está rodeada por al menos un nodo.

   Un plan que no lo cumpla se rechaza **diciendo qué paso queda abierto** (las dos
   casillas y las regiones que une). Vale para los dos productores de planes: el
   generador procedimental y el agente (`map_generate`).
2. **Las ciudades son nodos y se conquistan.** Un castillo pasa a ser una ciudad
   colocada en un nodo. La base es una ciudad. Una ciudad cambia de dueño por
   conquista: batalla contra su guarnición o su héroe, o entrar si está vacía. Es
   la regla de captura de castillo que ya existe (`captureTown`).
3. **Control de los nodos que no son ciudad.** Pisar un nodo libre o enemigo sin
   defensa lo hace tuyo, como la bandera de una mina hoy. El dueño del nodo se
   escribe en **un solo sitio**, según el contrato «un hecho, un sitio».
4. **El territorio se calcula, no se guarda.** `regionOwner(state, region)` es el
   dueño común de **todos** los nodos (ciudades incluidas) que rodean la región, o
   `null`. Encaja con la regla de «un hecho, un sitio»: el dueño de una región se
   deriva de sus nodos.
5. **Conexión con la base.** `conectadoABase(state, player, region|nodo)` mira si
   hay una cadena de regiones propias y nodos propios desde la base. Se calcula,
   no se guarda.
6. **La renta sale del territorio.**
   - Las minas y los recursos dentro de una región producen para el **dueño de la
     región**, no para quien pisó la bandera.
   - Una región sin dueño no da nada.
   - Una ciudad aislada (no conectada) no produce su ingreso.
   - Las cifras son provisionales y van en datos.
7. **Recursos: oro, piedra y madera.** Los siete recursos de HoMM pasan a tres.
   Costes de edificios, renta de minas, recursos sueltos y cofres se traducen con
   una tabla **provisional y declarada inventada**, en datos. Lo que no tenga
   traducción se quita.
8. **El generador procedimental produce mapas válidos de esta forma.**
   - Regiones con pasos estrechos: la idea de valles de
     `git show archivo/gpt-rpg:src/core/rpg/landscape.ts`, como terreno o regiones
     del `MapPlan`. **No** como `GameMap.barriers`; se descartó el diff que lo
     hacía.
   - Ciudades en nodos de grado ≥ 3.
   - Varios caminos entre cada base y sus ciudades cercanas.
   - Minas y pueblos dentro de las regiones. **Pueblos**: un objeto del mapa
     dentro de una región, que cambia de dueño con ella. Su producción de tropa es
     de la fase 3; aquí solo existe y cambia de dueño.
   - El banco juega estos mapas.
9. **La IA de reglas juega el territorio.** Valora nodos y regiones (cerrar una
   región, cortar la conexión del rival, defender sus nodos) lo bastante como para
   que las partidas **terminen**: el barrido da 0 sin terminar. No tiene que ser
   buena; tiene que jugar y acabar.
10. **El agente lo ve y lo diseña.**
    - `map_generate` acepta nodos y ciudades-nodo, con su validación y su prosa en
      `RESPONSE_FORMAT`.
    - El turno de aventura y la consulta `map` incluyen nodos, dueños de nodo,
      regiones y territorio, filtrados por niebla como todo lo demás.
    - `pnpm qa` ejercita un mapa diseñado con nodos.
11. **El cliente lo enseña**, sobre el cliente nuevo:
    - los nodos y su dueño (bandera o color);
    - las fronteras de región y el territorio de cada facción, con el color del
      dueño de la región;
    - las regiones sin dueño, neutras;
    - las ciudades como puntos fuertes;
    - los recursos en la barra (oro, piedra y madera).

    `pnpm capturas` lo recorre y lo fotografía.
12. **Banco re-anclado UNA vez al final**, mirando la forma: partidas que terminan,
    hechos nuevos (captura de nodo), ningún hecho imposible, duración y ganador
    publicados. `pnpm verify`, el barrido, `pnpm qa` y `pnpm capturas` en verde.

## Fuera de alcance

Van a la fase 3:
- fortificaciones construidas en nodos;
- guarniciones de nodo;
- reclutamiento por disponibilidad en la base (producción de pueblos y ciudades);
- los edificios de ciudad por facción;
- las ruinas al conquistar.

Van a la fase 4 o después:
- las facciones nuevas y sus tropas;
- el motor de habilidades;
- los tipos de héroe;
- el desgaste de guarnición (descartado por ahora);
- la IA buena: proteger al comandante, contratar más héroes y una sola medida de
  fuerza.

## Contexto del coordinador

- **Estado**: `main` en `386e068`, banco `957a2486…`, 594 tests.
- **Pathfinding y desempate**: `src/core/map/frontera.ts` y su contrato de
  desempate siguen siendo sagrados.
- **Riesgo serio**: que la IA no sepa jugar el territorio y las partidas no
  acaben. Hoy el ganador está volcado (98,5 %) y nadie contrata un segundo héroe.
  El barrido es la señal.
- **Tamaño**: este ciclo es grande. El arquitecto puede proponer partirlo (por
  ejemplo, 2a la estructura, validación, generador y territorio en el núcleo; 2b
  la IA, el contrato, el cliente y la economía de 3 recursos), como se hizo con la
  fase 1.

## Decisiones del usuario sobre el plan (01-10-2026)

- **Se parte en dos ciclos**, como propone el plan: **2a «la red»** y **2b «el
  territorio a la vista»**, cada uno con su commit y su re-anclaje. El criterio 12
  se lee por ciclo. Este ciclo ejecuta **solo 2a**.
- **Una región cerrada pero DESCONECTADA de la base NO da renta.** Corrige la
  opción por defecto del plan. Todo lo que no está conectado a la base deja de
  producir (regiones y ciudades), así que cortar un nodo hace mucho daño. La renta
  de una región exige que sea tuya **y** que esté conectada.
- **Las ciudades neutrales nacen CON guarnición.** Corrige la opción por defecto
  del plan. Hay que pelear para tomarlas. Guarnición provisional en datos y dentro
  del tope de 7.
- Quedan con la opción por defecto del plan, sin objeción del usuario: el grado de
  un nodo es el número de regiones distintas que toca, y los recursos sueltos y
  los cofres son de quien los pisa.

## Decisión del usuario tras la implementación de 2a (01-10-2026)

- **Perder la base elimina** a la facción en el acto, aunque le queden héroes o
  ciudades. Es la regla de victoria del documento («se gana tomando las bases
  rivales»), que se adelanta de la fase 3. **Sustituye** a la regla que
  improvisó el ingeniero en `checkDefeat` (sin héroes, sin base y sin oro para
  contratar).

## Decisión del usuario: la base nace con guarnición (01-10-2026)

Con «perder la base elimina», las partidas se volvieron carreras: la IA asalta la
base rival vacía y la mediana bajó a 4 días. Además, `pnpm qa` se quedó en 5
decisiones de batalla y su partida termina el día 3. El documento ya pedía
ciudades «difíciles de tomar: murallas por defecto, bonificadores al defensor y
guarnición inicial».

El usuario elige **«Guarnición inicial ya»**:
- en la 2a, cada base nace con una **guarnición provisional en datos**, de 7 como
  mucho;
- las murallas y la bonificación al defensor quedan para la fase 3, con las
  fortificaciones.

Hay que medir y publicar:
- la duración (mediana, p90, máximo);
- el ganador;
- el barrido (0 sin terminar);
- la cobertura de `pnpm qa` (días y decisiones de batalla, que tiene que volver a
  un orden comparable a las 28 de antes).

El banco se re-ancla una vez.
