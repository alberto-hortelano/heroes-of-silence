# Al defender, el daño del atacante y los modificadores de todos

## Petición literal

> «Al defender, que la rueda muestre los numeros de daño del atacante y que en la seccion
> lateral se muestren bonificadores y penalizaciones y tambien en el panel que hay sobre la
> rueda que muestra los combatientes, que muestre los modificadores de ambos»
>
> — el usuario, 31-10-2026

Respuestas a las dos preguntas que se le hicieron:

- **¿Qué cifras van en cada sector de la rueda al defender?** «Las dos»: arriba y más
  grande, el daño que te haría el atacante si respondes con ese tipo; debajo y más pequeño,
  tu contraataque, como hoy.
- **¿De quién se ven los modificadores en la sección lateral?** «De todos, en donde pone
  "En el campo" aparecen todos los personajes». La lista «En el campo» está en el lateral de
  la batalla de la partida y en el de la arena (`listaDelCampo`, `views/panels.ts`).

## Hoy

- **La rueda de la respuesta** (`RuedaPendiente` en la fase `respuesta`,
  `client/rueda/rueda.ts`, con `previsionDeLaRueda` del núcleo): cada sector dice el daño
  del contraataque de quien responde («5–29»). No dice nada del daño que le va a hacer el
  atacante.
- **El panel sobre la rueda** («Tu respuesta» o «Tu golpe», con las dos figuras,
  `contrincante` y `CaraDeLosContrincantes`): el nombre de cada uno, su bando y «(tú)» o
  «(rival)». No lleva modificadores.
- **«En el campo»**: una fila por unidad en pie con flecha, nombre y cuenta (en la partida,
  los efectivos; en la arena, los PV, quién la mueve y «Editar»). No lleva modificadores. La
  ficha de la unidad elegida en la arena ya enseña pastillas como «+3 Ataque»; el panel de la
  partida no enseña ninguno.

## Criterios de aceptación

1. **La rueda al defender** (la persona responde; partida y arena): cada sector lleva dos
   cifras.
   - La principal es la horquilla del daño que haría el golpe del atacante si respondes con
     ese tipo. Va de lo menos a lo más, según lo que elija él entre todos sus tipos de golpe:
     el cruce, su multiplicador y sus golpes (Rápido: «2 × a–b»), su carga y la armadura de
     quien responde.
   - Debajo, más pequeña, la de tu contraataque, igual que hoy. Si no hay contraataque,
     solo la del atacante.
   - Lo calcula el núcleo (la previsión de la rueda), no el cliente, con las mismas
     cuentas que cobra el golpe. Dos cifras distintas en pantalla no pueden contradecir lo
     que se cobra.
2. **La rueda al golpear** (fase `golpe`): no cambia.
3. **El panel sobre la rueda**: debajo del nombre de cada uno de los dos combatientes van
   sus modificadores en curso, como pastillas cortas con signo. Por ejemplo: «+3 Ataque»
   (Ofensivo o Bendecir), «+1 Defensa» (Defensivo), «−2 Ataque» (Romper guardia), «+1
   Casillas» (Prisa), «−1 Casillas» (Lentitud), y la carga que cobra quien golpea si carga
   («carga +20 %»). Sin modificadores, nada (ni el hueco). Va en la partida, la arena y el
   espectador, que pintan el mismo panel.
4. **«En el campo»**: cada fila lleva los modificadores en curso de esa unidad, con la misma
   forma de pastilla, en la partida y en la arena. Una fila sin modificadores queda como hoy.
5. **Qué es un modificador**: lo temporal que lleva colgado el stack (`BattleStack.effects`:
   lo que deja la rueda, los hechizos y los poderes), dicho con lo que hace y con la nota de
   cuánto le queda (`efectoEnCurso`, `duracionDeEfecto`). En el panel de la rueda va además la
   carga de quien golpea. El equipo de serie y el rango no son modificadores: ya están en sus
   cifras y en la ficha.
6. **Una sola forma**: la pastilla del modificador de un efecto sale de un sitio y la usan el
   panel de la rueda y «En el campo». Se reutiliza lo que ya hay para enseñar un efecto o una
   pieza (`efectoEnCurso`, `modificadoresEnPantalla`, `cifraDeEfecto`), sin una tercera
   redacción.
7. **El agente**: no cambia su contrato (su `battle_response` ya trae lo suyo). Si el arquitecto
   ve que el agente pierde algo que la persona ve ahora, lo propone, pero no entra en esta tarea.
8. **Se lee en el móvil**: el panel de la rueda y «En el campo» no se desbordan con tres o
   cuatro pastillas (se parten en líneas).

## Fuera de alcance

- La recta de quien te carga en el tablero (backlog de la tarea anterior).
- Cambiar las reglas, las cifras, la rueda o los efectos.
- La moral y la suerte (la moral no tiene efecto en la batalla).
- Rehacer la ficha de la arena.

## Contexto

- No se prueba la jugabilidad (CLAUDE.md): se prueba que lo que se enseña case con lo que se
  cobra y que se vea bien.
- Lo visual se juzga mirándolo: el usuario querrá verlo en el navegador (partida y arena),
  con una URL que le demos.
- La máquina es compartida: tests por partes, con su porqué; nada de `pnpm verify` entero.
- La tarea anterior (`docs/agents/2026-10-31-rueda-antes-de-la-carga/`) dejó la carga
  plantada sin correr cuando se abre la respuesta: la horquilla del atacante cuenta su carga
  desde la llegada (`GolpeEnCurso.carga`).

## Preguntas abiertas (con la suposición por defecto)

- **Rápido del atacante en la horquilla**: por defecto, la horquilla de un golpe de Rápido se
  da por golpe con «2 ×», igual que la rueda del golpe. Mezclarla con las demás en un solo
  rango engaña.
  - Si el sector agrupa varios tipos del atacante, se da el mínimo y el máximo del daño
    total del intercambio (los dos golpes de Rápido sumados) y la nota del sector lo
    desglosa. Lo decide el arquitecto con un criterio que se pueda leer.
- **Cuánto se ve en «En el campo»**: por defecto, la pastilla corta («+1 Defensa») con el
  efecto entero (quién lo puso y cuánto le queda) en la nota «ⓘ» o en el `title` que ya se usa
  para las aclaraciones.
