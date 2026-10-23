# La trama de los mundos: biblia en prosa, más lugares, árboles hondos y desenlaces distintos

Sigue a la F1a del mapa vivo (`docs/agents/2026-10-22-mapa-vivo/`, en `main` desde 7822ecfd). Lo
coordina una sesión hija de la que lleva el mapa vivo.

## Petición literal

Tras jugar un mundo generado desde el menú de `pnpm dev` (22-10-2026):

> «En la partida que estoy jugando lo que he visto de sitios me ha parecido demasiado simple tanto
> graficamente como en historia. En los ejemplos del principio, que son de una sesion de claude,
> habia tramas interesantes y originales, se podia conversar con los npcs y se veia una historia
> detras, ahora es todo muy plano.»

Y, al elegir por dónde empezar:

> «Empieza por la historia: que el motor escriba una trama de verdad (biblia en prosa primero, más
> lugares, árboles más hondos, finales distintos) y lo que haga falta en la skill y el validador.»

«Los ejemplos del principio» son los de `docs/agents/2026-10-22-mapa-vivo/requisitos.md` (Corvo,
Valdesombra, Gruk, San Eloy, Ilveth): cada uno con un secreto, una decisión con consecuencias que
se notan en otro sitio (traidor para los orkos, hereje para la Orden, la aldea que se levanta esa
noche) y gente que habla como quien es.

## Decisiones del usuario (22-10-2026)

- **La biblia se guarda en el mundo**: `assets/mundos/<id>/biblia.md`, junto a `historia.json`,
  para que la lean fases futuras (conversación en vivo, F4). El juego no la lee aún.
- **Los finales no son una mecánica nueva**: «Sin desenlace, el final es conquistar la base
  enemiga.» La partida acaba como siempre. «Finales distintos» = la trama se resuelve de maneras
  distintas según lo que se elija (de qué lado se pone uno, qué se revela, a quién se entrega),
  con consecuencias que se ven en los lugares (estados, marcas, quién está, qué se ofrece), no un
  epílogo ni un `game_over`.
- **El motor, con Opus y esfuerzo alto**: se acepta que generar tarde 5-10 minutos con la
  suscripción (sin API key).

## Criterios de aceptación

1. La skill `motor-de-mundos` pide **primero** `biblia.md` en prosa —qué pasó antes de que llegue
   el héroe, quién es quién y qué quiere cada uno, sus secretos, cómo se cruzan los sitios, la
   trama principal y sus desenlaces posibles— y **después** `historia.json`, que la traduce.
   `historia.json` no contradice la biblia (lo comprueba el motor al releerla, no el validador).
2. `biblia.md` es parte del mundo: `pnpm mundo validar <id>` rechaza un mundo sin ella o con ella
   vacía o ridícula (un tope mínimo razonable), diciéndolo como todo lo demás (fichero y motivo).
   La misma regla en la CLI, el servidor que genera y —si la página lo carga— la página; si la
   página no la carga, que sea explícito y por qué.
3. Un mundo generado desde el menú trae **una trama principal** que encadena **al menos tres
   lugares** por marcas (lo que se hace o se sabe en uno abre, cierra o cambia algo en otro), y en
   total **de 4 a 8 lugares** (por tamaño de mapa, lo decide el plan), en regiones distintas.
4. **Árboles hondos**: la gente principal de la trama tiene conversaciones con varias ramas y
   varios niveles (preguntar por su pasado, por los otros, mentir, presionar), no 2-3 nodos. El
   arquitecto propone una medida comprobable (p. ej. profundidad o nodos por diálogo de una
   persona) y si la exige el validador o solo la skill.
5. **Al menos dos desenlaces de la trama principal**, excluyentes y alcanzables por caminos
   distintos: elegir uno cierra el otro (por marcas o estados), y lo que se gana o se pierde es
   distinto. El arquitecto decide si el validador lo comprueba (p. ej. declarando los desenlaces
   en `historia.json` y probando que cada uno se alcanza y que se excluyen) o solo la skill.
6. Si el vocabulario cerrado (`core/mundo/formato.ts`, `VOCABULARIO`) o el validador
   (`core/mundo/validar.ts`) impiden escribir eso —p. ej. una condición sobre el estado de **otro**
   lugar, topes de nodos, de lugares o de largo de texto—, se amplía con lo mínimo, fail-loud, con
   su frase en el vocabulario (que la lectura del motor saca de ahí) y la misma validación en la
   CLI, el servidor y la página. Lo que se añada al núcleo lo juegan también la pantalla del lugar
   y la IA de reglas (`ai/lugares.ts`).
7. `tools/mundo/motor.ts` lanza `claude -p` con Opus y esfuerzo alto, con el tope de tiempo
   ajustado a eso, y los permisos dejan escribir y editar `biblia.md` además de `historia.json`. El
   progreso del menú cuenta también la biblia («escribe la biblia»).
8. `assets/mundos/ejemplo` y `assets/mundos/prueba` siguen valiendo: se adaptan o se regeneran
   (sin compatibilidad hacia atrás: si el formato cambia, se sube `VERSION_DEL_MUNDO`). `ejemplo`
   se regenera con el motor nuevo y es la muestra de lo que sale.
9. Se ejerce de verdad: un mundo generado desde el menú de `pnpm dev` (o con el mismo lanzador)
   con el motor nuevo, validado por `pnpm mundo validar`, y comparado con
   `/home/al/code/heroes/assets/mundos/gen-20261022-596849` (3 lugares, 9 KB, árboles de 2-3
   nodos): número de lugares, nodos por diálogo, marcas que cruzan lugares, desenlaces y tiempo de
   generación.
10. `CLAUDE.md` al día (la fila de «Un mundo» de las puertas únicas, «Lugares» de las reglas, lo
    del motor en «Arrancar»), y `pnpm verify` en verde.

## Fuera de alcance

- Conversación en vivo con los NPC y el motor en vivo (F4); que el agente entre en los lugares.
- Arte de los lugares y fondos (F2); **las skins de NPC y el pintado de personas**: los hace otra
  sesión en `claude/affectionate-chaplygin-911d42`. No tocar `render/` de personas ni arte.
- Un desenlace del mundo como mecánica (epílogo, `game_over` por trama): descartado por el usuario.
- Reputación con facciones, el mapa que reacciona (F5), escenas grandes de varias salas.
- Subir nada a origin.

## Contexto

- Lo que sale hoy (`gen-20261022-596849`, semilla 596849): «El cáliz de Navas del Rey», 3 lugares,
  2 marcas (una cruza lugares), diálogos de 1-3 nodos, un encuentro. El `ejemplo` (escrito con la
  skill de hoy): 3 lugares, 5 marcas, diálogos de 1-5 nodos. La skill pide «de 2 a 4 lugares,
  cortos»; el validador admite de 1 a 8 (`LUGARES_MAXIMOS`).
- El lanzador (`argumentosDelMotor`) no fija modelo ni esfuerzo: usa el modelo por defecto de quien
  lo lanza. Tope de 15 min (`TOPE_DEL_MOTOR_MS`). Hoy tarda ~1 min.
- Vocabulario de hoy: condiciones `estado` (solo de **este** lugar), `marca`, `oro`, `lleva`,
  `faccion`, `no`; efectos `estado` (de este lugar), `marca`, `oro`, `pieza`, `quitar`, `tropa`,
  `batalla`. Reglas fuertes: cada premio se cobra una vez; una opción con premio se apaga sola;
  `noCortaSuCamino`; todo nodo alcanzable.
- La máquina es compartida: nada de `pkill`; presupuesto de pruebas (tests caros una vez al
  cerrar). Generar con el motor gasta suscripción y minutos: como mucho dos o tres generaciones
  reales en todo el ciclo.
- El usuario no abre nada en los worktrees: si hay que enseñarle algo, se levanta en otro puerto y
  se le da la URL.

## Preguntas abiertas (con suposición por defecto)

- ¿El estado de otro lugar como condición, o basta con marcas? → Por defecto, basta con marcas si
  la crítica no encuentra un caso que las marcas no cubran sin trampas.
- ¿Se versiona el formato? → Solo si `historia.json` cambia de forma (p. ej. desenlaces
  declarados); `biblia.md` nueva obligatoria también es un cambio de formato del mundo.
- ¿Cuántos lugares por tamaño? → Pequeño 4-5, mediano 5-6, grande 6-8; lo afina el arquitecto.

## Correcciones tras la crítica (22-10-2026, aceptadas por el usuario)

La crítica (`critica.md`) sale **REENCUADRADA** y el usuario acepta el reencuadre:

- **Criterio 2**: la regla de la biblia vive en el lado del disco (`validarEnDisco`: la CLI y el
  servidor que genera). La página no la carga (el juego no la lee y ningún mundo va al build), y se
  dice así en `cargar.ts` y en `CLAUDE.md`.
- **Criterio 4**: la profundidad la pide la skill, no el validador. Se mide en el QA (nodos y
  hondura por diálogo de la gente principal, comparados con `gen-20261022-596849`).
- **Criterio 5**: los desenlaces los pide la skill, y el motor comprueba al releer la biblia que
  existen y se excluyen. El validador no los declara ni los prueba. La skill sabe que el mundo es de
  los dos: el rival puede cerrar un desenlace, y el `ya` de una marca de desenlace no habla en
  segunda persona.
- **Criterio 6**: el vocabulario de hoy basta (marcas para encadenar y excluir). Solo se amplía si
  al escribir la skill aparece un caso concreto que no se pueda escribir, y se cita.
- **Criterio 7**: `--model opus` y `--effort xhigh` fijados en el lanzador (hoy ya los hereda de
  `~/.claude/settings.json`; se fijan para que no dependa de la máquina). El tope de tiempo se fija
  tras la primera generación real, medida.
- **Orden con el banco de NPC** (`claude/affectionate-chaplygin-911d42`, decisión del usuario:
  «trabajar ya, generar después»): skill, lanzador y biblia se hacen ya sobre `main`; **ninguna
  generación real hasta que el banco de NPC esté en `main`**; entonces se fusiona `main` aquí y se
  regenera `ejemplo`. Mientras, `ejemplo` y `prueba` llevan una `biblia.md` escrita a mano para
  seguir valiendo.
