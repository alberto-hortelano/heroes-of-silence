# Puesto fronterizo en los pasos

## Petición literal

> «Si quiero que al tomar un paso se cree un puesto fronterizo donde puedes dejar tropa
> defendiendolo. El puesto podras mejorarlo con empalizadas y murallas, de forma que el puesto base
> muestre una caseta en el mapa una vez alquien lo ha tomado, una torreta de madera si es una
> empalizada o una torre si esta amurallado.»

Viene de la pregunta anterior del usuario: «al entrar en un nodo que no es ni pueblo ni ciudad,
simplemente un paso por las montañas, que se puede hacer? He entrado en uno y no pasa nada». Hoy un
nodo (`MapObject` `kind: 'node'`, `core/map/map.ts`) se toma pisándolo, también de pasada
(`collectAt` → `captureNode`, `core/state/game.ts`); su único efecto es territorial (`territorio`,
`dueñoComun`, `rentaDelDia`, `dispersarAsaltantes`) y la única señal es «Paso tomado» en la crónica.

## Decisiones del usuario (04-11-2026, en la conversación)

1. **Bloquea**: un puesto enemigo con tropa dentro no se cruza ni se toma sin vencerla; pisarlo abre
   una batalla contra su guarnición. Sin tropa, se toma pisándolo, como hoy.
2. **Las mejoras ponen muros en la batalla**: la batalla del puesto se pelea con muralla (la de la
   arena, `battle/muralla.ts`, hoy solo en la arena; las del mapa van con `SIN_MURALLA`):
   empalizada de madera y muralla de piedra, con su bono para los de lo alto.
3. **Todos los nodos que no son ciudad** llevan puesto: montaña, bosque, acantilado, puente (agua) y
   la puerta de muralla.
4. **El arte, por Codex con la suscripción** (`codex exec`, el taller), sin gastar en fal.ai; con
   marcadores mientras no esté.

## Segunda vuelta (04-11-2026, tras ver el plan) — MANDA sobre lo de abajo

Petición literal:

> «Si esta el heroe, elije la tropa que quiere usar para la defensa, el heroe siempre participa. En
> las ciudades y pueblos pasamos a hacerlo de la misma manera. En las ciudades hay muralla. En los
> pueblos empalizada. Si para en un puesto puede intercambiar tropa, dejar o llevarse.»

Y, al preguntarle qué pasa al vencer la tropa de un pueblo:

> «Los pueblos pasan a ser posibles nodos. Se tratan como una ciudad. Lo mismo con las ciudades.
> Ahora creo que siempre son nodos y no tendrian porque. La mayoria de las ciudades deberian estar en
> mitad de una region, no en un nodo de defensa. Pueblos y ciudades se pueden atacar para robarlas.
> Lo pueden hacer las tropas que se infiltran (Aun no esta implementado) Y roban lo que haya en la
> ciudad. No se la quedan. Mientras un heroe enemigo esta en una ciudad o pueblo de tu region este
> deja de sumar. Puedes recuperarlo atacando»

Respuestas a las preguntas de después: una ciudad o un pueblo en mitad de una región es **de quien
tenga la región**; una ciudad que sí está en un nodo (la base) **se toma, como un paso** (perder la
base sigue eliminando); y el trabajo se parte en **tres tareas**:

- **Tarea 1 (ESTA)**: puestos en los pasos; la defensa con el héroe eligiendo tropa, igual en
  puesto, ciudad y pueblo; muralla en las ciudades y empalizada en los pueblos; intercambio de tropa
  al parar.
- **Tarea 2 (después, otro ciclo)**: ciudades y pueblos fuera de los nodos (la mayoría de las
  ciudades en mitad de su región; los pueblos, a veces en un nodo, tratados como una ciudad), su
  dueño derivado de la región, y **la ocupación**: un héroe enemigo dentro de una ciudad o pueblo de
  tu región hace que deje de sumarte hasta que lo echas atacándolo.
- **Tarea 3 (después)**: las tropas que se infiltran y el robo («roban lo que haya en la ciudad. No
  se la quedan»).

Lo que cambia en la tarea 1 respecto de lo de abajo:

- **D1. La defensa con el héroe dentro** (puesto, ciudad o pueblo): elige qué tropa defiende, de su
  ejército y de la guarnición, hasta el tope de tropa de la partida; **el héroe siempre pelea**. La
  persona lo elige en una pantalla antes de la batalla; la IA de reglas y el agente, por la IA (la
  jugada del agente para elegir, a backlog salvo que quepa). Lo que no se elige no pelea; qué le
  pasa si se pierde la batalla lo decide el plan (suposición: se pierde con el sitio). Sustituye la
  regla de hoy del castillo («con el héroe del dueño dentro, la defiende solo él con su tropa»), y
  la pregunta 6 del plan queda resuelta: el héroe defiende con la muralla del sitio.
- **D2. Sin héroe**, defiende la guarnición entera (hasta el tope), como hoy en la ciudad.
- **D3. Murallas**: toda batalla contra una ciudad se pelea con muralla de piedra (también la base);
  contra un pueblo, con empalizada de madera; contra un puesto, la de su nivel (base sin muralla,
  empalizada, muralla). Ninguna forma cierra el tablero (en el mapa no hay escaleras).
- **D4. Los pueblos tienen guarnición**: su dueño es el de su región (como hoy su renta). Un héroe
  enemigo que pisa un pueblo con guarnición pelea contra ella con empalizada; si gana, la guarnición
  muere y él queda allí (la ocupación y lo que deja de sumar es la tarea 2: aquí no cambia la renta).
- **D5. Intercambio al parar**: en un puesto, ciudad o pueblo propio, el héroe que para puede dejar,
  llevarse e intercambiar tropa con la guarnición, desde su pantalla. **Se retira la recogida
  automática al pasar** por una ciudad propia (`takeGarrison` en `collectAt`).
- **D6. El banco SÍ cambia**: con murallas en las batallas de ciudad y la defensa con el héroe
  eligiendo, las partidas de la IA cambian. Se re-ancla `pnpm banco` y se juzga la forma del diff;
  `barrido-semillas.ts` y `arena-ia.ts` siguen en 0 sin terminar. (Esto deshace la corrección del
  criterio 15 del plan.)
- **D7 (tercera vuelta, tras el plan rehecho)**: «Metemos ya las escaleras, las murallas si cierran,
  si no habria que rehacerlo todo al meter las escaleras. Tambien hay puertas. Todo lo demas
  correcto.» Las murallas de ciudad, pueblo y puesto **cierran** el tablero y **llevan puertas**; el
  atacante del mapa entra **con escaleras** (y por las puertas), como en la arena (`battle/muralla.ts`,
  `pasoPermitido`; los botones de escalera y puerta, hoy en `arena/main.ts`). Lo que eso pide entra
  en la tarea 1: la partida juega la muralla (escaleras, subir, abrir y cerrar puertas) para la
  persona en los dos papeles, la IA de reglas la sabe jugar al atacar y al defender, y el agente
  tiene sus jugadas en el contrato (no se le filtran). Lo demás del plan rehecho, aprobado (también
  que quien vence a un pueblo se queda en su casilla de antes).
- **D8 (04-11-2026)**: la escalera la lleva **todo el bando atacante**: cada stack y su héroe, una
  cada uno, sin comprarla, y se gasta al ponerla (la recomendación del plan; respuesta del usuario:
  «Todo el atacante»).
- **D9 (04-11-2026, tras QA de la fase 1)**: el intercambio en un sitio es **repartir y
  confirmar**: la pantalla deja colocar la tropa a un lado y a otro, como la defensa, y al
  confirmar el núcleo juzga solo el reparto final, así que con el héroe y la guarnición llenos se
  puede cambiar un soldado por otro (respuesta del usuario: «Repartir y confirmar»; antes, cada
  botón movía uno y con los dos llenos todo salía apagado).
- **Fuera de la tarea 1**: mover ciudades y pueblos fuera de los nodos, la ocupación, el dueño
  derivado de la ciudad, los infiltrados y el robo.

- **D10 (05-11-2026, tras la fase 3)**: la obra de un paso **se queda con el paso** cuando otro
  jugador lo toma (respuesta del usuario: «Se queda»): la empalizada o la muralla son del sitio.
- **D11 (05-11-2026, tras la fase 4)**: el arte de las tres piezas (caseta, torreta de madera, torre
  de piedra, Codex por la suscripción) y su colocación junto al paso, aprobados por el usuario a la
  vista de `capturas/fase4-hoja-de-contacto-3.png` («Me vale así»).

## Criterios de aceptación

1. Un nodo que no es ciudad, al tomarlo un jugador, **pasa a ser un puesto fronterizo** de ese
   jugador, en el nivel base. Un nodo neutral (nunca tomado) no es puesto y se ve como hoy.
2. **Dejar tropa**: el héroe propio que está en su puesto puede dejar en él tropa de su ejército y
   recogerla, con la pantalla del puesto (no basta con la crónica). Lo que el núcleo ya exige al
   ejército del héroe se respeta y lo que no se puede se dice con su `*Blocker`. El cupo de la guarnición tiene un tope declarado (inventado, en `data/`).
3. **Abrir el puesto**: parar la marcha en un puesto propio (o pulsarlo con el héroe dentro) abre su
   pantalla; pasar de largo no la abre. La pantalla dice el nivel, la guarnición, las mejoras y su
   coste, y cada acción apagada dice su motivo.
4. **Defensa**: el héroe enemigo cuya ruta pisa un puesto con guarnición se detiene en él y pelea
   contra ella (atacante el héroe, defensora la guarnición, sin héroe). Si gana, toma el puesto
   (sigue el mismo nivel de mejora, con dueño nuevo y sin guarnición) y sigue la regla de hoy del
   territorio. Si pierde, el puesto sigue del dueño, con lo que le quede de guarnición. La ruta y la
   previsión de la marcha lo avisan como avisan hoy de un objetivo defendido.
5. **Puesto sin guarnición**: se toma pisándolo, también de pasada, como hoy (`node_captured`).
6. **Mejoras**: base → empalizada → muralla, en ese orden, pagadas en oro (precios inventados en
   `data/`, declarados), compradas desde la pantalla del puesto con el héroe dentro (si el
   arquitecto propone otra puerta —p. ej. sin héroe—, se decide en el plan). No se baja de nivel.
   Tomar un puesto ajeno conserva su nivel (o el plan dice otra cosa y por qué).
7. **Muros en la batalla**: la batalla contra un puesto con empalizada se pelea con una muralla de
   madera y con muralla, con una de piedra (formas de `battle/muralla.ts` o nuevas, validadas por
   `validarMuralla`); la del puesto base, sin muralla. La guarnición defiende desde dentro. El bono
   de lo alto es el de la arena (`defensaEnLoAlto`) o uno declarado por material.
8. **En el mapa**: el puesto base pinta una **caseta**, la empalizada una **torreta de madera** y la
   muralla una **torre**, con el color del dueño (la marca o la bandera de siempre). El neutral, como
   hoy. Sin arte, cada nivel pinta su marcador distinto (el juego se juega sin arte).
9. **El arte**: las tres piezas pedidas por el taller con Codex por la suscripción, con su guía y su
   escala, en las direcciones o variantes que haga falta para los ejes de un paso; no tapan la senda
   ni el eje del paso (`pasosALaVista`, `pasosAtravesados`, los guardias de la escena siguen a 0).
   El puente y la puerta de muralla: el plan decide dónde va la pieza (junto al estribo, en lugar del
   portón…) sin romper sus guardias.
10. **La niebla**: un puesto ajeno se ve con su último nivel y dueño sabidos (`objetosConocidos`);
    su guarnición, solo lo que el juego deje ver hoy de una guarnición ajena.
11. **La IA de reglas** sabe pelear contra un puesto defendido (lo pesa como hoy pesa una
    guarnición: `ventajaClara`) y no se rompe; dejar tropa o mejorar puestos, si el plan no lo
    incluye, va a backlog (ver «Fuera»).
12. **El agente**: el contrato (`knownMap`, `game_state`) le dice de cada puesto su nivel y su dueño,
    y la prosa, la regla nueva. Las jugadas del agente (dejar tropa, mejorar) las decide el plan:
    si no entran, la prosa lo dice y va a backlog.
13. **El espectador** pinta el puesto con su nivel (`adaptar.ts` sigue siendo la inversa exacta).
14. La crónica: hechos nuevos con protagonista, sitio y sello (`emit`), al menos «mejora el puesto»,
    «deja tropa» y la batalla del puesto en su `battle_ended`.
15. `pnpm banco` cambia (las partidas cambian a propósito): se re-ancla y se juzga la forma del
    diff; `barrido-semillas.ts` sigue en 0 sin terminar.

## Fuera de alcance

- Equilibrio, cifras finas y si los puestos «valen la pena» (CLAUDE.md: no se prueba la
  jugabilidad). Los precios y topes son inventados y se declaran.
- Muralla en las batallas de ciudad o en otras batallas del mapa: solo la del puesto.
- Renta, vista o cualquier efecto del puesto fuera de la defensa (salvo que el plan lo proponga como
  mejora y el usuario lo apruebe).
- Destruir o bajar de nivel un puesto.
- Gastar en fal.ai.

## Contexto

- Hoy no hay acción para **dejar** tropa en ninguna parte (la ciudad solo da su guarnición:
  `takeGarrison`, `garrison_taken`); habrá que crearla.
- La muralla de batalla existe en la arena (`battle/muralla.ts`, `pasoPermitido`, `bonoEnLoAlto`,
  formas en la arena) y `createBattle(…, muralla)` la admite: falta llevarla al mapa.
- Los pasos de bosque y montaña no llevan pieza a propósito (#196, #203: el portillo desentonaba y
  la garganta tapaba el camino); el de acantilado lleva hito (`HITOS`, `nodos.ts`); el de agua,
  puente; el de muro, la puerta de la muralla. La pieza nueva convive con eso.
- Imágenes por Codex: memoria `codex-imagenes` (`codex exec` + `resume`, el PNG por `thread_id`);
  taller en `tools/taller/`, `docs/art/taller.md`.
- Pruebas por partes y con su porqué; nada de `pnpm verify` entero (CLAUDE.md, «Control de
  calidad»). Máquina compartida: nada de matar por patrón.
- El usuario no abre nada en los worktrees: levantar el servidor en otro puerto y darle la URL.

## Preguntas abiertas (con la suposición por defecto)

- ¿Cuántos stacks caben en un puesto? → el tope de tropa de la partida (`ReglasDelCombate.tope`),
  sin héroe.
- ¿La mejora es inmediata o tarda? → inmediata, como construir en la ciudad (una por día y puesto si
  el plan lo ve necesario).
- ¿Se mejora sin héroe dentro? → no: con el héroe en el puesto.
- ¿El puesto propio es parada obligatoria del héroe propio? → no: se cruza de largo.
