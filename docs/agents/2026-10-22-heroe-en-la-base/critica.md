**REENCUADRADA**: el problema es real y la tarea va en buena dirección, pero el alcance tiene cuatro errores: hay 4 candidatos en el imperio y no 3; el precio no puede distinguir a los candidatos; el día 1 sin héroe ya ofrece «Contratar héroe (2500 oro)»; y «el turno no avanza sin héroe» no puede ser una regla general.

## El problema real
Hoy el héroe de salida se elige fuera de la partida (en el menú) y no cuesta nada, así que no compite con la tropa. El usuario quiere que sea la primera compra de la partida, hecha en la base, pagada con el mismo oro que la tropa. La solución propuesta ataca ese problema. El matiz es que hoy el precio no puede diferenciar a los candidatos (ver la premisa 4).

## La premisa, afirmación por afirmación
1. *El menú elige facción y héroe y lo deja en la URL.* **Cierto**: `inicio/inicio.ts:73-78` (`aHeroe`) y `jugar`. La partida rápida escribe solo la semilla (`inicio.ts:114`), y `main.ts:113-121` (`abrePartida`) escribe después las tres.
2. *`newGame` crea el héroe dentro de su base y el rival lleva el tipo por defecto.* **Cierto**: `core/state/setup.ts:200-223`. El inicial no es un recién hecho: lleva 2/2/1/2, la tropa de salida (`startingArmy`, con 5 o 6 individuos medidos en s1-3), Flecha mágica y Logística y Sabiduría. Además no recoge la guarnición (`setup.ts:204-207`, decisión del usuario).
3. *Los tipos no tienen efecto en las reglas.* **Cierto**: `hero.ts:31-37`.
4. *«Si los tipos difieren en cifras, el precio sale del índice».* **No difieren.** Medido con `heroUnit` + `indiceDePoder` (s1-3, las cinco facciones): todo héroe inicial da índice 433, que son **370 de oro** con `oroDelIndice`, sea del tipo que sea. El contratado (1/1) da 423, que son 360. Así que el precio derivado es el mismo para todos los candidatos, equivale a un recluta, es el 1,3 % de los 27 500 de salida y **no casa con `HERO_HIRE_COST` = 2500** (`game.ts:354`), que es casi 7 veces más por un héroe peor y sin tropa.
5. *«Los tipos de su facción (tres)».* **Falso para el imperio**: tiene 4 (`duelista`, `mago`, `capitan_mercenario`, `ingeniero`, `data/tipos-de-heroe.json`). Los otros cuatro tienen 3. Las ocho hojas por tipo existen (`data/figuras-de-heroe.json`).
6. *`HERO_HIRE_COST` está sin JSON ni `_comment`.* **Cierto, y está duplicado**: `views/panels.ts:682` lleva «Contratar héroe (2500 oro)» tecleado, cuando el contrato de «un hecho, un sitio» pide una sola fuente.
7. *La morada elige figura con clic o botón, con su ficha.* **Cierto**: `escenas/morada.ts` y `escenas/de-pie.ts`. `encuadrarLaMorada` recibe el número de figuras, así que admite 3 o 4.
8. *Al empezar, la base tiene `village_hall` y la primera morada* (medido en s1). No hay taberna ni castillo, y no hay versión abierta del ayuntamiento: solo las moradas tienen `abierta-*.webp`.

## El día después
- **Lo que cambia para quien juega**: elige el héroe viendo su figura en la base y paga. Mientras los tipos sean inertes y cuesten lo mismo, elegir es cosmético y pagar es un impuesto fijo. Equivale a bajar `oroDeSalida` en P. Hay que decírselo al usuario, no esconderlo.
- **Se vuelve más difícil** abrir una partida jugable con `newGame({ seed })`. Hay **256 llamadas** a `newGame(` en `src`, `test` y `tools`, 39 ficheros de test y 55 líneas de test con `heroes[0]` o `'hero-0'`. **No hay que hacer** que el estado sin héroe sea lo que da `newGame` por defecto: tiene que ser opcional, y lo de por defecto sigue siendo el héroe del tipo por defecto, ya pagado.
- **Dos caminos el día 1**: sin héroe dentro, el panel de la base ya enseña «Contratar héroe (2500 oro)» (`panels.ts:680-682`). Ese botón da un héroe 1/1 sin tropa por `hireHero`, que además **sí recoge la guarnición** (`game.ts:1654`). Si los dos se ven a la vez, el usuario puede pagar el héroe equivocado. No se deben dejar los dos visibles.
- **Reclutar antes de elegir** mandaría la tropa a la guarnición (`views/morada.ts:42`), y el inicial no la recoge. Va contra el «se descuenta de lo que queda para reclutar más tropa».
- **Lo que habría que borrar**: `renderEleccionDeHeroe` (`pantallas.ts:90`), el paso `'heroe'` y el estado `heroe` de `inicio.ts`, y los pasos del héroe en la pasada «arranque» de `capturas.ts` (`:1258`). El retrato `identidad.webp` y la descripción de esa pantalla sirven para la ficha nueva.
- **Contra `CLAUDE.md`**: «la URL lleva las tres tras empezar» se mantiene con la P2. «Sin compatibilidad hacia atrás» no estorba.

## Conflictos
- **Complejidad del combate** (rama `heroes-combat-complexity-5d77b0`, aún sin requisitos en disco): mete un selector en «Nuevo juego». Choques directos: la unión `pantalla` y lo que hace el `submit` de la elección de facción en `inicio.ts`, `pantallas.ts`, `hayQuePreguntar` (`semilla.ts:33`) si su opción va en la URL, la lectura de la URL y `abrePartida` en `main.ts:113-195`, `NewGameOptions` (`setup.ts:55-70`) y la pasada «arranque» de `capturas.ts`. Hay que fusionar esta primero, porque quita un paso, o pactar que el `submit` de facción abre su pantalla y no la partida.
- **Mapa vivo** (`mapa-vivo-de40b2`, personaje fijo en la base): `render/base/escena.ts:44` y `escenas/castillo.ts:4` (quién camina: héroe o alcaide), `Session.vecinosDeLaBase` y el alcaide (`session.ts:1486-1520`), y la unión `Scene`. Si los candidatos se pintan en la plaza, el choque es frontal. Si van en una escena de pie aparte, como la morada, solo comparten la unión `Scene` y el panel de la base.
- **#115** (la IA no contrata un segundo héroe): no bloquea, pero si el precio pasa a un sitio común, `planHires`, la reserva de `planRecruits` y `ORO_DE_SOBRA_PARA_NOVATOS` (`strategy.ts:445,468,737`) tienen que leerlo de ahí.
- **Dependencia oculta**: el día que los tipos tengan habilidades, si el precio sale del cuerpo vestido, cambiará solo. Si es una cifra por tipo, alguien tendrá que mantenerla.

## Coste contra valor
El trabajo es medio: una escena de pie que ya existe como molde, una puerta del núcleo, el menú y la URL, y re-anclar el banco. El valor es real pero estrecho mientras los tipos sean inertes: es la sensación de reclutar al héroe más un impuesto de salida. Si no se hiciera, no se rompería nada. Vale la pena porque el usuario lo pide explícitamente y el molde está hecho. No vale la pena inventar diferencias entre tipos para justificar el precio: eso es «Fuera de alcance».

## Las siete preguntas abiertas, cerradas
1. **El menú**: «Nuevo juego» elige solo la facción y la partida abre en la base con los candidatos. Con los dos sitios habría dos elecciones de lo mismo, y la del menú no cobra.
2. **`?heroe=`**: **se conserva** con el sentido de «ya elegido y pagado». Sin él, la base pregunta. No hay guardado (`Cargar partida` está apagado), así que una recarga siempre vuelve al día 1 y `?heroe=` reproduce el arranque entero, como pide el contrato de la URL. La recarga a media elección (con seed y facción, sin héroe) vuelve a preguntar en un estado idéntico, siempre que no se pueda hacer nada antes de elegir (P5). Un tipo que no es de la facción se sigue rechazando (`problemaDeTipo`). **Coste**: `capturas.ts:1194,2346,2423,3207`, `neutro.ts:115,128` y `temas-con-piezas.ts:360` abren `?seed=N` solo y esperan el mapa con el héroe. Hay que añadirles `&heroe=` o hacer que jueguen la elección.
3. **Partida rápida**: el héroe por defecto, pagado con la misma regla, sin preguntar, y escrito en la URL como `?heroe=` (para la P2, rápida es igual que «ya elegido»).
4. **El precio**: no puede salir del índice para distinguir candidatos, porque todos son 433. Pasa a decisión del usuario (D1). Sea cual sea la cifra, va en `data/economia.json` con su `_comment` de inventada, y el botón de `panels.ts:682` la lee de ahí.
5. **Salir sin héroe**: no se puede. Hasta elegir no se recluta, no se construye y no se pasa el turno. **No hay que hacerlo** como «sin héroes no se pasa el turno»: a media partida, un jugador que perdió a su héroe y no tiene el oro de un contratado se quedaría bloqueado. `strategy.ts:458-466` describe justo ese estado. Tiene que ser «héroe de salida pendiente», no «sin héroes».
6. **La IA y el agente**: los dos llevan el tipo por defecto, pagado por **la misma función del núcleo** que la elección de quien juega, y en el mismo momento del arranque. **Sin cambio en el contrato**: elegir un tipo inerte no le da al agente nada que decidir, y `hire_hero` (`contract/agent.ts:69`) no lleva tipo. El agente verá menos `you.gold`, y ninguna prosa del servidor cita el oro de salida (comprobado con grep). Si la puerta emite un hecho nuevo en la crónica, entonces sí cambia el contrato y hace falta `pnpm qa`.
7. **Candidatos**: todos los tipos de la facción, uno por tipo y sin sorteo, en el orden del JSON con el de por defecto primero. Son 3, o 4 en el imperio. Sortear abriría otra corriente de azar sin cambiar nada.
- **Banco y barrido**: si todos pagan P al empezar, el hash cambia a propósito. La forma esperada es el mismo mapa y como primer hecho distinto la primera compra del día 1 del j0. Si la tropa de salida pasa de la tirada de `newGame` a la corriente de una acción, cambian también las tiradas posteriores. Se re-ancla. El barrido de 4 semillas tiene que salir con 0 sin terminar. Con P = 2500, el castillo (15 000) sigue cabiendo el día 1, que es la condición del `_comment` de `oroDeSalida`.

## Qué le cambiaría a `requisitos.md` (para pegar)
> - Criterio 1: «una figura por tipo de héroe de su facción (3; 4 en el imperio)».
> - Nuevo criterio: mientras el héroe de salida esté pendiente, la base no ofrece «Contratar héroe» ni deja reclutar, construir o pasar el turno, cada cosa con su motivo del núcleo. A media partida, un jugador sin héroes sigue pudiendo pasar el turno.
> - Nuevo criterio: `newGame` sin opciones nuevas sigue dando cada héroe de salida del tipo por defecto, ya pagado. El estado «por elegir» es opcional, solo para quien juega sin `?heroe=`.
> - Pregunta 4, resuelta: los tipos no difieren en cifras (índice 433, 370 de oro, en todos). El precio es la cifra de la decisión D1, en `data/economia.json` con `_comment`, y lo leen la elección inicial, `hireHero`, la IA y el botón del panel.
> - Contexto: el día 1 hoy ya enseña «Contratar héroe (2500 oro)» sin héroe dentro (`panels.ts:680-682`). La elección nueva sustituye ese botón mientras el héroe de salida esté pendiente.

## Decisiones del usuario
- **D1 · El precio del héroe de salida** (el mismo para todos los candidatos mientras los tipos sean inertes):
  (a) **el de contratar hoy, 2500, una sola cifra para todo héroe y movida a `data/economia.json`** (recomendada: se nota frente a la tropa y no deja dos precios para «un héroe»);
  (b) derivado del índice como la tropa: 370, lo que cuesta un recluta, casi no se nota;
  (c) otra cifra inventada solo para el de salida.
- **D2 · Dónde se ven los candidatos en la base**:
  (a) **escena de pie ante el ayuntamiento** (`village_hall`, el edificio que la base tiene al empezar), con la cámara acercada como en la morada y su exterior, porque no tiene versión abierta (recomendada: es el molde de la morada y no choca con el personaje fijo de la plaza);
  (b) de pie en la plaza misma, junto a quien camina (choca con mapa vivo);
  (c) ante la taberna (no está construida al empezar y no tiene versión abierta).
- **D3 · ¿Contratar a media partida enseña también los candidatos?**
  (a) **no por ahora**: `hireHero` sigue igual y solo comparte el precio (recomendada: es «Fuera de alcance» y otra tarea);
  (b) sí, con la misma escena.
