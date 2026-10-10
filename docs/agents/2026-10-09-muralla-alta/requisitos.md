# Muralla alta

Segundo ciclo sobre `docs/agents/2026-10-09-murallas-en-la-arena/` (editor,
formas, borrador y aviso de despliegue: se quedan). Los cambios de aquel ciclo
están sin commit en el árbol; este trabaja encima.

## Petición literal

> Mi idea era que las casillas de muro sean altas, esten a otro nivel, y que los
> de dentro puedan subir y disparar desde ahi. Que no se pueda disparar ni puedan
> disparar los que esten al otro lado del muro. Y visualmente que se vean mas
> arriba, como si fueran columnas. Los asaltantes pueden subir si van con
> escalera o saben escalar. Cuando lleguen al pie de la muralla es un turno
> entero para colocar la escalera, otro para subir y al subir se quedan arriba y
> no pueden atacar ni hacer nada mas ese turno.

## Respuestas del usuario (09-10-2026)

- Disparo: el tirador en lo alto dispara a cualquiera y los de fuera pueden
  dispararle; en el suelo nadie dispara a través del muro. «El 1 pero el tirador
  de arriba tiene +x a defensa».
- Cuerpo a cuerpo: solo al mismo nivel.
- Escalar: con escalera un turno colocarla y otro subir; escalando, un turno.
  «El 1 pero escalar es rasgo de cada personaje». La escalera puesta se queda y
  la usan otros atacantes.
- Puerta a ras (solo el defensor); voladoras se posan arriba; las de dos casillas
  no suben.

## Criterios de aceptación

Las reglas, la IA, el cliente y los tests de `plan.md` (aprobado por el usuario
tal cual). En particular:

1. Los defensores suben andando a los muros; los atacantes, solo con `subir`.
2. En el suelo no hay tiro a través de muro o puerta; desde o hacia lo alto, sí.
3. Cuerpo a cuerpo y «trabado» solo al mismo nivel.
4. Tirador en lo alto: +`defensaEnLoAlto` (data/muralla.json, inventado, 3).
5. Escalera: un turno ponerla (sin haberse movido), otro subir (sin haberse
   movido), y al subir no hace nada más ese turno; la escalera se queda para
   otros. Rasgo `escalar`: sube en un turno sin escalera.
6. Columnas visibles y figuras elevadas encima; clic en la columna elige su hex.
7. Arena: rasgo «Escalar» en la ficha y «Lleva escalera» por unidad del montaje;
   botones «Poner escalera» y «Subir» al jugar a mano.
8. IA: defensores tiradores suben y disparan; atacantes sin camino escalan.
9. Sin muralla, nada cambia: `pnpm banco` mismo hash, `enfrentamiento.ts`
   idéntico.

## Fuera de alcance

Contrato del agente (acciones nuevas), catapulta/derribo/foso, escalera como
equipo del juego. Backlog del primer ciclo (M5, M8, ficha cortada a 1280).

## Contexto

Otras sesiones en la máquina: `--port` propio (3100 ocupado), nada de matar por
nombre, sin commit ni push, Playwright sin pantalla. Rama `asalto`.

## Ampliación (09-10-2026, tras probarlo el usuario)

> El que esta arriba no deberia poder bajar por la parte de fuera de la muralla,
> deberian ser mas altas, unas 4 veces mas, si se sale de la pantalla podemos
> mover la zona de casillas mas abajo y agrandar la pantalla y tapar con z index
> al que pase por debajo, por ejemplo por la puerta

Criterios (decididos por el coordinador; se pueden corregir):

10. **Dentro y fuera, derivados.** «Dentro» son las casillas de suelo unidas a
    la zona de salida del defensor (`bandoDeSalida`) sin cruzar muro ni puerta;
    el resto del suelo es «fuera». Una función del núcleo (`ladoDe(m, hex)` o
    similar en `muralla.ts`, cacheada por muralla). Si la forma no cierra (una L
    con hueco), todo es dentro y no hay restricción: se dice en la ayuda.
11. **Desde lo alto solo se baja hacia dentro**, sea quien sea el que está arriba
    (defensor o atacante que subió). Y el defensor **sube solo desde dentro**
    (las escaleras interiores). La regla vive en `pasoPermitido`; el motivo de
    rechazo lo escribe el núcleo («Desde la muralla solo se baja hacia dentro.»).
    Voladoras, sin cambio. El escalar del atacante, sin cambio.
12. **Columnas cuatro veces más altas** que ahora; las figuras de arriba, a esa
    altura. Si no caben, el tablero baja y el lienzo crece lo que haga falta
    (solo cuando la batalla tiene muralla: sin muralla, el encuadre de hoy, que
    es el de las batallas del juego).
13. **Lo de delante tapa lo de detrás**: una figura que pasa detrás de una
    columna queda tapada por ella; **la puerta es una portada alta** (de la
    altura de la muralla, con su arco abierto abajo) y quien está en la casilla
    de la puerta pasa por debajo: el dintel se pinta encima de él. Las figuras de
    arriba y sus rótulos siguen viéndose.
14. Sin muralla nada cambia (banco y enfrentamiento iguales).

## Ampliación 2 (09-10-2026, tras probarlo el usuario otra vez)

> Lo acabo de probar y la ia ha pasado por enciama de la muralla y ha bajado por
> el otro lado, otro a pasado por la puerta. Prueba con murallas de mas de una
> casilla de grosor. Deacuerdo con tu propuesta de a y b

Las propuestas aceptadas: (a) la columna que tapa la casilla bajo el ratón se
vuelve translúcida; (b) las figuras tapadas por una columna se pintan como
silueta encima de ella.

Diagnóstico del coordinador: con la definición de «dentro» de la ampliación 1,
una forma que no separa las dos salidas (un semicírculo que no llega a los
bordes, una línea con hueco) deja **todo dentro** y de lo alto se baja por
cualquier lado. Es lo que vio el usuario.

Criterios:

15. **Dentro y fuera por cercanía andando.** Cada casilla de suelo es del lado
    cuya salida queda más cerca andando con muros y puertas cerrados (BFS
    multiorigen desde las dos salidas; empate o inalcanzable → dentro). Con una
    forma que cierra da lo mismo que hoy; con una que no cierra, lo de delante de
    la curva o de la línea es fuera y lo de detrás, dentro. Ya no hay «si no
    cierra, todo dentro». La ayuda del editor y la rejilla rayada lo dicen así.
16. **Murallas gruesas** (dos y tres casillas de fondo, rectas y en semicírculo,
    con y sin puerta): de muro a muro se anda arriba; se baja solo a dentro; el
    defensor sube solo desde dentro. Tests y fuzz con esas formas (añadir dos
    formas gruesas a los ejemplos si ayuda a probarlo a mano).
17. **La puerta**: averiguar quién pasó por ella en la prueba del usuario. Si fue
    un atacante, es un fallo y se arregla. Si fue un defensor, es la regla (la
    cruza el defensor, en los dos sentidos) y se deja anotado para preguntar al
    usuario.
18. **(a)** la columna que tapa la casilla bajo el ratón (o la casilla de un
    destino resaltado) se pinta translúcida; **(b)** una figura tapada (entera o
    en parte) por una columna se pinta como silueta (contorno del color de su
    bando) por encima de la columna. El clic llega a la casilla de detrás cuando
    la columna está translúcida.

## Ampliación 3 (09-10-2026): la puerta se abre y se cierra

> La puerta la pasamos a abrir o cerrar, al principio del turno se puede abrir o
> cerrar, decide el defensor. Si esta abierta puede pasar cualquiera y si esta
> cerrada no pasa nadie, es mas realista. Las voladoras bajan por donde quieran

Criterios (los detalles no dichos los fija el coordinador; se pueden corregir):

19. **Estado de la puerta** en `BattleState` (mutable, fuera de la muralla
    congelada): cada puerta, abierta o cerrada. **Empieza cerrada.**
20. **Cerrada: no pasa nadie** (ni el defensor). **Abierta: pasa cualquiera**, a
    ras, de los dos bandos; abierta tampoco tapa el tiro (cerrada sí).
21. **Abrir o cerrar** es una acción del defensor (`abrir_puerta` /
    `cerrar_puerta {puerta}`), **al principio del turno** de una unidad suya: solo
    si aún no se ha movido ni ha actuado; no gasta el turno (como `cast`), y cada
    puerta se cambia una vez por turno de unidad. Cualquier unidad defensora puede
    hacerlo, esté donde esté. No se cierra con alguien en la casilla de la puerta.
    Su `*Blocker` escribe el motivo; crónica `gate_opened` / `gate_closed`.
22. Dentro y fuera se siguen calculando con las puertas **cerradas** (la forma no
    cambia de lado al abrir).
23. **Voladoras: bajan y se posan por donde quieran** (sin cambio; queda escrito).
24. **IA del defensor**: abre una puerta cuando una unidad suya quiere salir por
    ella y ningún atacante puede llegar a la puerta este turno; la cierra cuando
    un atacante puede llegar y no hay nadie en ella. **IA del atacante**: usa la
    puerta abierta como camino (las distancias leen el estado de la puerta, sin
    cachés que se queden viejas).
25. **Cliente**: la portada se pinta con las hojas abiertas o cerradas; botones
    «Abrir puerta» / «Cerrar puerta» en el panel del defensor al empezar su turno
    (con varias puertas, se elige con un clic en la portada, como el muro de la
    escala), con el motivo cuando no se puede. Las frases y la ayuda del editor,
    con la regla nueva («la puerta solo la cruza quien defiende» desaparece).
26. Sin muralla nada cambia (banco y enfrentamiento iguales). El contrato del
    agente sigue fuera.

## Ampliación 4 (09-10-2026): la puerta es una juntura entre dos casillas

> Otra cosa, Que la puerta deje de ser una casilla, que sea la conexion entre dos
> casillas, la puerta bloquea el paso de una a otra pero no ocupa una casilla, se
> coloca como dos casillas, en horizontal para marcar donde queda, no se si me
> explico

Interpretación del coordinador (se puede corregir):

27. **Una puerta es el lado compartido de dos casillas de suelo vecinas en
    horizontal** (misma fila, columnas c y c+1): `{a, b}` con `b` al este de
    `a`. Ninguna de las dos es muro; las dos se pisan con normalidad (una unidad
    puede estar en cualquiera de ellas). La puerta solo afecta al paso de `a` a
    `b` y de `b` a `a`.
28. Cerrada: ese paso no lo da nadie que ande (las voladoras, sí). Abierta: lo da
    cualquiera. No se cierra si una unidad de dos casillas ocupa `a` y `b` a la
    vez. Lo demás de la ampliación 3 sigue (empieza cerrada, la abre o cierra el
    defensor al principio del turno de una unidad suya, sin gastarlo).
29. Tiro: en el suelo, una recta que pasa de `a` a `b` (o al revés) con la puerta
    cerrada está tapada; abierta, no.
30. Dentro/fuera: se calcula con las puertas cerradas como pasos cortados. Que la
    forma cierre o no depende de muros y puertas juntos (en odd-r una puerta en
    una fila par puede dejar rendija por las diagonales: el editor lo enseña con
    lo rayado y con «la forma no cierra»).
31. **Formato**: `puertas: [{a, b}]` validado (vecinas en horizontal, dentro del
    tablero, ni `a` ni `b` muro, sin repetir). Las formas de ejemplo se rehacen
    con el formato nuevo y que sigan cerrando. Una forma guardada con el formato
    viejo se dice inválida con su motivo y se conserva tal cual (el mecanismo de
    siempre).
32. **Editor**: con la herramienta Puerta, al pasar el ratón por una casilla se
    resaltan ella y su vecina del este; el clic pone (o quita) la puerta entre las
    dos. Se pinta como una marca sobre el lado compartido.
33. **Pintado en batalla**: la portada alta se levanta sobre el lado compartido,
    con las hojas abiertas o cerradas; tapa y silueta como las columnas.
