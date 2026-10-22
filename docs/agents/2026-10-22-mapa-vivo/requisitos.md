# Mapa vivo: lugares que visitar y personajes con personalidad

Tarea de los puntos 5 y 6 de una lista de seis que dio el usuario el 22-10-2026. La coordina
otra sesión (la de los puntos 2 y 3); esta sesión lleva el 5 y el 6 juntos porque comparten el
modelo de personajes y lugares. Es el punto que más le interesa al usuario («este es el punto
más interesante»).

## Petición literal

Punto 5:

> «Ciudades, pueblos y bases con más vida. Al crear un mapa el motor de narrativa crea
> personajes con sentido dentro de estos lugares y se pueden crear personajes fijos, por
> ejemplo un jefe de la guardia para tu base al que le puedes preguntar cosas y te puede dar
> consejos sobre cómo luchar o incluso entrenarte en peleas de entrenamiento, un sirviente para
> los no muertos que te llama amo y te da consejos malignos y responde a tus preguntas, todos
> con una personalidad interesante.»

Punto 6:

> «He quitado la parte de minas estilo homm para meter más rpg. Quiero que el mapa esté vivo
> con sitios interesantes. Tengo mapas hexagonales para los combates y también mapas de
> movimiento libre de scroll horizontal con un poco de fondo que son como los mapas de combate
> pero sin rejilla y con scroll. Me gustaría que en el mapa hubiera sitios que visitar. Por los
> que vas andando, con ambiente. Puedes encontrar cosas, hablar con personajes y entrar en modo
> combate. Y que esto sea lo general en lugar de recoger recursos.»

Al preguntarle por el ritmo (visita corta o lugar grande que se explora un rato): **«Ambas»**.

## Ideas que el usuario trajo de otra conversación y le gustaron

Son una dirección, no un requisito cerrado:

- **El combate ocurre donde estás**: al tocar a un enemigo en la escena lateral, la escena se
  congela, aparece la rejilla encima y se pelea con ese fondo. La posición en que te pillan
  puede afectar al despliegue (emboscada, flanco).
- **Los lugares sustituyen a los recursos**: reclutar en sitios concretos (el cementerio, el
  campamento orko, la ermita templaria), equipo explorando ruinas, oro de encargos y saqueo.
  Cada sitio da algo que no da ningún otro.
- **El mapa reacciona**: un estado simple por lugar (intacto, asediado, arrasado, aliado); una
  aldea que saquean si no llegas; un comerciante que aparece solo de noche.
- **Reputación con las facciones**, moneda blanda que abre o cierra reclutamiento, diálogos y
  rutas.
- **Cada lugar definido como datos** (capas de fondo, puntos de interés con su posición en X,
  condiciones, diálogos, encuentros), para reutilizar fondos con distinto contenido.
- **Ejemplos con historia**:
  - «El puente del viejo Corvo» (corto, Imperio): un soldado anciano cobra peaje por orden de un
    capitán muerto hace veinte años; se le paga, se pelea o se le convence con un documento, y
    entonces se une como veterano único; si los orkos arrasan la zona, el puente queda vacío
    con su carta sin enviar.
  - «El pozo de Valdesombra» (corto, No muertos): el cubo saca algo distinto cada vez; la voz
    pide un anillo robado; tirarlo al pozo revela un tesoro; quedárselo levanta la aldea esa
    noche.
  - «Los desertores de Gruk» (corto, Orkos): reclutarlos baratos y que los orkos te vean como
    traidor, o entregarlos y que el caudillo te abra su fortaleza.
  - «La abadía de San Eloy» (grande, Templarios): huerto, claustro, biblioteca y cripta; el
    abad lleva meses muerto y algo ocupa su lugar con el consentimiento de los monjes; avisar a
    la Orden, y la abadía arde, o pactar, y reclutas no muertos pero eres hereje.
  - «El linde de Ilveth» (grande, Elfos e Imperio): aserradero, claro con un ermitaño y árbol
    madre; sabotear, ayudar o pactar con encargos para los dos; si el aserradero sigue, el
    bosque mengua y los elfos se vuelven hostiles en otras regiones.
  - Los lugares se conectan: el documento de Corvo está en la biblioteca de San Eloy y el
    anillo del pozo lo lleva un desertor de Gruk.

## Lo que pide el coordinador para esta sesión

- **El crítico parte el trabajo en fases** y las decisiones de diseño se cierran con el usuario
  **antes** de que el arquitecto planifique.
- Una primera fase razonable (a confirmar): **el modelo de un lugar como datos, un lugar corto
  jugable de punta a punta y un personaje fijo de la base con personalidad.**
- Terminado, por fase: ciclo cerrado, `pnpm verify` en verde, `pnpm qa` si se toca el
  contrato, la URL de un servidor levantado en otro puerto (el usuario no abre nada en los
  worktrees) y un commit en la rama `claude/mapa-vivo-de40b2`. Sin fusionar a main ni subir.

## Criterios de aceptación (de la fase 1; el crítico los ajusta)

1. Un lugar del mapa se describe **como datos** (`data/…json`): fondo, puntos de interés con su
   posición, personajes, diálogos, condiciones y encuentros. El núcleo lo valida al cargar y
   falla diciendo qué está mal (fail-loud).
2. En una partida de `pnpm dev` hay al menos **un lugar corto** en el mapa. Al pisarlo con el
   héroe se entra en una **escena lateral de scroll** (como la base, sin rejilla) por la que se
   anda.
3. En ese lugar se puede, de punta a punta: **hablar con un personaje** (con elecciones),
   **encontrar algo** y **entrar en combate**; y lo que se elige tiene una consecuencia que
   persiste en la partida (el lugar cambia de estado, se gana algo).
4. La base del jugador tiene **un personaje fijo con personalidad** (p. ej. el jefe de la
   guardia o el sirviente de los no muertos) al que se le pueden **hacer preguntas** y que da
   consejos.
5. **Todo se juega sin agente y sin arte**: los diálogos y personajes tienen respaldo
   determinista; sin imágenes, marcador.
6. La lógica (estado del lugar, consecuencias, condiciones) vive en `core`, puro, y pasa por
   `createRng`; el cliente solo pinta y manda intents por `session.ts`.
7. Lo que cambia la partida va a la crónica (`emit`) y el banco lo ve; lo que es presentación
   (texto narrado) no.

## Fuera de alcance (fase 1, salvo que el crítico y el usuario digan otra cosa)

- Los cinco ejemplos enteros con sus conexiones entre lugares.
- Reputación con facciones, el mapa que reacciona solo (aldeas saqueadas por el rival, ciclo
  día/noche: el clima lo hace otra sesión).
- Generar arte nuevo con fal.ai o Codex (salvo que se decida; sin presupuesto acordado).
- Que el agente escriba lugares nuevos al diseñar el mapa (se decide con el usuario si entra).

## Contexto y coordinación

- El juego acaba de quitar minas y recursos («solo oro», 21-10-2026) para dejar sitio a esto.
  Los pueblos (`village`) siguen como nodos de región que dan 250 de oro al día.
- Ya existe: las voces de la base (`town_voices`, `vecinosDeLaBase`, `vozDe`, `ponerVoces`,
  `data/vecinos.json`, respaldo determinista), la conversación (`<dialog id="conversacion">`),
  la base y la morada como escenas laterales (`render/base/`, `escenas/castillo.ts`,
  `escenas/morada.ts`, `escenas/de-pie.ts`), los nodos del mapa (`core/map/`), el agente por MCP
  (`src/server/`, `contract/`), la arena y `createBattle` (peleas de entrenamiento),
  `core/rpg/` (el personaje).
- **Otras sesiones trabajan a la vez** (cada una en su worktree):
  - *heroe-en-la-base*: elegir el héroe en la base, con coste. Toca la base y la morada.
  - *clima*: el clima en el mapa, el combate y las escenas laterales.
  - el coordinador: la rueda del combate (3, 5 o 7 tipos) y el tamaño de la tropa.
  Hay que apuntar en la entrega los ficheros compartidos y evitar reescribir lo de ellas.
- Memorias del usuario que aplican: pocas pruebas de jugabilidad (ni tests ni medidas de
  equilibrio); lo visual, sin tests mientras se itera; sin compatibilidad hacia atrás; el
  presupuesto de pruebas (máquina compartida).

## Preguntas abiertas (con la suposición por defecto)

1. **¿Quién escribe lo que dicen los personajes cuando el humano juega en `pnpm dev`?** Hoy el
   agente solo juega contra el servidor (`pnpm partida`); en `pnpm dev` no hay narrador.
   «Preguntar cosas» con texto libre pide un modelo de lenguaje. Por defecto: en la fase 1,
   diálogos en árbol (preguntas a elegir) escritos en datos, y el agente solo los colorea donde
   ya hay agente.
2. **¿Qué es un «lugar» en el mapa?** ¿Un nodo nuevo (`MapObject`) que se pisa, el pueblo de
   cada región convertido en lugar, o los dos? Por defecto: un objeto nuevo del mapa, sin dueño
   ni renta, que el generador coloca en regiones de fuera.
3. **El combate en el lugar**: ¿la rejilla sobre el fondo de la escena (idea del usuario) en la
   fase 1, o basta con la batalla de siempre? Por defecto: la batalla de siempre en la fase 1.
4. **¿El fondo de la escena del lugar?** Sin arte nuevo, ¿reusar el de las bases o un marcador?
   Por defecto: reusar placas de base y marcador.
5. **Peleas de entrenamiento con el jefe de la guardia**: ¿en la fase 1? Por defecto: no, fase 2.

## Decisiones del usuario tras la crítica (22-10-2026)

La crítica (vuelta 1, `critica.md`) proponía un lugar fijo hecho a mano dentro de un pueblo. El
usuario lo **reencuadra**: lo que se construye es **el sistema con el que el motor de narrativa
genera los lugares**, no lugares fijos. Respuestas literales:

- Diálogos sin agente: **«Árbol en datos»** (preguntas a elegir, sin texto libre en esta fase).
- Qué es un lugar: **«Objeto nuevo ya. Ignora el que cambie todos los mapas, ahora la generacion
  de mapa es mucho mas costosa y no se generan mapas a lo loco. Se genera arte para cada mapa en
  funcion de lo que necesite el motor de narrativa. Si un lugar es una cueva se genera arte para
  la cueva en el mapa y para el interior de la cueva y los elementos que haya dentro. Tambien se
  genera arte para personajes»**.
- Personaje fijo de la base: **«Uno nuevo por faccion como base pero el motor de narrativa puede
  generar el que considere. Si en la historia estas en el castillo de tu anciano padre este podria
  ser al que le preguntes. Se genera arte bajo demanda para las animaciones tambien»**.
- Lugar corto de la fase 1: **«Buscamos el sistema que permite al motor de narrativa generar
  lugares no lugares fijos»**.
- Cuándo corre el motor: **«Las dos»** — antes de jugar, escribiendo un «mundo» a disco que
  `pnpm dev` juega sin agente, y en vivo con el servidor; el formato es el mismo.
- Quién dibuja la red: **procedimental + motor encima** — el generador hace regiones, río y
  ciudades; el motor lee ese mapa y pone lugares y personajes donde tienen sentido.
- Arte bajo demanda: **Codex por suscripción** (como bases y figuras; sin gasto en dinero).
- Combate en la fase 1: **la batalla de siempre**; la rejilla sobre el fondo, después.

Consecuencias que el coordinador saca (a confirmar por la crítica, vuelta 2):

- Un mapa deja de ser «una semilla»: es **un mundo**, un paquete en disco (semilla del
  procedimental + lugares + personajes + diálogos + encargos y resultado del arte) que se genera
  una vez, despacio, y luego se juega muchas. Cambiar todos los mapas procedimentales no importa.
- El **formato** de lugar y personaje es el contrato entre el motor y el juego: un vocabulario
  cerrado que el núcleo valida (condiciones, efectos, encuentros, premios) y texto libre solo en lo
  que es presentación. Lo que el motor no puede comprobar se deriva.
- El personaje fijo de la base por facción es el **respaldo** del formato (datos del repo); un
  mundo puede poner el suyo.
- Sin mundo, el juego sigue jugándose como hoy (procedimental, sin lugares o con los de respaldo).

## Decisiones del usuario tras la crítica, vuelta 2 (22-10-2026)

- P1, qué guarda el mundo del mapa: **el plan congelado** (el plan entero del procedimental, que
  `newGame({ plan })` ya acepta) más la semilla de la escena.
- P2, facciones: **«El jugador elige faccion tamaño del mapa y numero de jugadores de IA y
  entonces se genera el mundo»**. Es decir: el mundo **no** se escoge de una lista hecha a mano;
  se genera para lo que pide quien juega en el menú.
- Quién lo genera en `pnpm dev`: **el servidor de desarrollo lanza Claude Code sin pantalla**
  (`claude -p`, con la suscripción, sin API key) con la skill del motor (y Codex para el arte, en
  la F2), con una pantalla de espera con el progreso. El mundo queda en disco y se puede volver a
  jugar.
- Número de jugadores de IA: **fase aparte**. En la F1 el menú pide facción y tamaño; el número de
  rivales existe en el formato y en el menú, fijo en 1, hasta que el generador sepa de 3-4 bandos.
- P3, dónde va un lugar: **cualquier casilla válida** (`lugarBlocker`), sin camino nuevo.
- P4, la IA de reglas: **sí entra en los lugares, con una regla simple**, ya en la F1a. (El agente,
  no: F4.) Con un mundo cambian las partidas de ese mundo; sin mundo (procedimental puro), el banco
  no cambia.
- P7, tropa como premio: **unidades del catálogo, sin nombre**. El veterano con nombre, después.
- Orden: **F1a (el mundo con lugares) y luego F1b (la gente de la base)**, esta después de que
  entre *heroe-en-la-base*.
- Por defecto del coordinador (no preguntadas): P5, sin arte nuevo en F1a: fuera, una variante de
  la hoja de pueblos o marcador; dentro, la plaza de una base o marcador. P6: la generación vive
  solo en `pnpm dev` (servidor de desarrollo, `src/client/desarrollo/` o plugin de Vite); los mundos
  en disco, fuera del build en F1a.

## Fase 1a, criterios de aceptación (sustituyen a los de arriba)

Un *mundo* es un paquete en disco (`data/mundos/<id>/` o donde diga el arquitecto): el plan del mapa
congelado, las facciones de la partida, lugares, gente, árboles de diálogo y encuentros. Lo valida
una función pura de `core`, que da todos los problemas escritos para el motor. La carga lanza con
ellos y la página dice por qué. Su contenido entra en `GameState` en `newGame` (para no cerrar la
puerta a la F4, el motor en vivo).

1. `pnpm mundo validar <id>` y la página aplican la misma validación. Un mundo roto no arranca y
   dice qué está mal y dónde.
2. Una orden del repo lee un mapa para el motor: regiones con nombre, suelo, nivel y vecinas,
   ciudades con su facción, pueblos, río, las casillas que admiten un lugar y el PNG del taller.
   Una skill le dice al motor cómo escribir el mundo.
3. **Desde el menú de `pnpm dev`** («Nuevo juego»: facción, héroe, tamaño del mapa, rivales = 1),
   el servidor de desarrollo genera el plan procedimental y lanza `claude -p` con la skill; una
   pantalla de espera enseña el progreso; al acabar, la partida arranca con ese mundo. El mundo
   queda en disco y `?mundo=<id>` lo vuelve a jugar sin agente. Si la generación falla o el mundo no
   valida, se dice por qué (y se puede jugar el procedimental de siempre). `?mundo=` junto a
   `?seed=` o `?faccion=` se rechaza diciéndolo. Debe haber también al menos un mundo de ejemplo
   generado así y guardado, para probar sin esperar.
4. Un lugar es un objeto nuevo del mapa. Se entra al acabar la marcha en él y se abre su escena
   lateral. En ella se anda, se habla en árbol (las opciones que no se cumplen salen apagadas con el
   motivo del núcleo), se encuentra algo y se pelea la batalla de siempre.
5. Las condiciones y los efectos son los del vocabulario cerrado de `critica.md` (estado, marca,
   oro, lleva, facción; estado, marca, oro ±, pieza, quitar, tropa, batalla con alGanar/alPerder).
   Cada efecto lo aplica una acción del núcleo con su `*Blocker`. Lo que cambia la partida va a la
   crónica y lo narrado no.
6. La IA de reglas visita lugares con una regla simple (P4). Sin mundo, el juego es el de hoy:
   `pnpm banco` no cambia.
7. El agente no entra en lugares (F4), y se declara. No hay arte nuevo (P5).
8. Sin tests de jugabilidad ni medidas de equilibrio; lo visual, con capturas.

**Fase 1b: la gente de la base**, después de *heroe-en-la-base*. Una persona siempre presente por
facción, de la misma forma que `Vecino`, con árbol y consejos derivados de la partida. Un mundo
puede sustituirla.

## Visto bueno al plan (22-10-2026)

- El usuario aprueba `plan.md` tal como está.
- P-c: **una opción que da algo o abre batalla se apaga a sí misma** (cambia estado o marca) y la
  validación del mundo lo exige: cada premio se cobra una vez.
- P-d: tras una batalla en un lugar, **se vuelve a la escena del lugar**, ya en su estado nuevo.
- P-a y P-b, por defecto del arquitecto: `?heroe=` junto a `?mundo=` se rechaza; los mundos
  generados (`gen-*`) no van a git; solo `prueba` y `ejemplo` se commitean.
