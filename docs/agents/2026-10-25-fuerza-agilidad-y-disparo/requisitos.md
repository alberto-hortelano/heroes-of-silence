# Fuerza y agilidad, disparo diferido, correr, dos armas y la rueda teñida (25-10-2026)

## Petición literal del usuario

> 1) Disparo: Eliges una casilla al principio de tu turno y al principio de tu siguente turno se
> dispara en linea recta entre el tirador y la casilla elegida. Da al primero que se encuentre en
> esa linea, aunque sea de tu equipo. Cuanto mas cerca de la casilla elegida mas daño. Esto va sin
> ningun test hasta que lo haya validado yo jugando. Ni los tests minimos porque podria no ser
> jugable o tener que cambiarlo mucho
>
> 2) El movimiento se hara corriendo, con la animacion de carga y la velocidad de carga si es mas
> de la mitad del movimiento maximo del personaje y caminando y a la velocidad de caminar si es la
> mitad o menos
>
> 3) Aparecen las caracteristicas fuerza y agilidad. El equipo deja de restar movimiento y todo
> tiene un peso, por cada n veces que se pase de la fuerza se resta uno de agilidad. Peso hasta la
> fuerza no resta nada. Daño minimo es fuerza y daño maximo es fuerza x agilidad. La idea es que un
> personaje torpe y fuerte como un troll tiene poca variabilidad a la hora de golpear. Un elfo tiene
> mucha. La agilidad tambien da el movimiento y la defensa. De forma que los cambios son:
> Ataque se queda igual, quizas haya que ajustar el numero a ser mas alto.
> defensa -> agilidad
> daño minimo -> fuerza
> daño maximo -> fuerza x agilidad
> velocidad = agilidad
> Ajusta todos los personajes a estas nuevas caracteristicas.
> La lanza de carga fuera, sera una lanza y una regla especial de la lanza cuando se carga montado.
>
> 4) Se permiten dos armas. Se usa la caracteristica de la mejor en cada tipo de ataque.
>
> 5) Los tonos de rojo a verde en funcion de la ventaja de cada ataque tambien en la rueda de
> combate. Los tuyos cuando atacas y los de tu enemigo cuando defiendes

## Decisiones del usuario (25-10-2026, respuestas a las preguntas del coordinador)

- **Apuntar cierra el turno.** Cada turno del tirador: al empezar sale el disparo pendiente desde
  donde está; luego elige entre apuntar otra vez (cierra el turno) o actuar como siempre (moverse,
  pegar, defender, esperar) sin dejar disparo pendiente.
- **La caída del daño va por la horquilla**: el alcanzado en la casilla elegida recibe la tirada
  máxima (fuerza × agilidad); cada casilla de distancia entre el alcanzado y la casilla elegida baja
  un cuarto de la horquilla (`tiradaEnCuartos`, cuarto = max(0, 4 − d)); a 4 o más, la mínima
  (fuerza).
- **El peso, por mitades de su fuerza**: peso ≤ fuerza no resta; −1 de agilidad por cada 50 % de su
  fuerza que el peso la pase (fuerza 20: peso 30 → −1, 40 → −2; 25 → 0: se trunca).
- **Escala**: agilidad 2-7, la escala de las casillas y de la defensa de hoy; fuerza 10-40, la del
  daño (×10, `ESCALA_DE_CIFRAS`). **El arma suma a la fuerza para el daño**: daño = [F, F × agilidad]
  con F = fuerza + lo que suma el arma (troll 40 + mandoble 20, agilidad 2 → 60-120; elfo 15 +
  espada 10, agilidad 6 → 25-150). El peso se compara con la fuerza del cuerpo, sin lo del arma.
- **Dos armas de cuerpo a cuerpo** en dos huecos, de una mano: con dos no hay escudo, y una a dos
  manos va sola (ni segunda arma ni escudo). Cada tipo de la rueda usa el mejor nivel de las dos;
  ataque y fuerza que suma, los de la mejor (cada cifra, la mayor). El peso de las dos se suma. Lo
  de distancia sigue en su hueco aparte.
- **La lanza** deja de tener hueco propio: es un arma de cuerpo a cuerpo más. Montado (rasgo
  `charge`) **y con una lanza puesta**, la carga cobra el +10 %/casilla del jinete de hoy; montado
  sin lanza, o a pie, el +5 %/casilla. **La carga a pie sigue.**
- **Correr solo se ve**: si un tramo andado es de más de la mitad de su movimiento máximo, va con la
  animación de la carga y su ritmo; si no, caminando y a su ritmo. La regla de la carga no cambia.
- **Escudo, armadura y héroe**: el escudo suma defensa encima de la agilidad y pesa; la armadura
  resta daño como hoy (`trasLaArmadura`) y pesa; nada resta movimiento salvo el peso. El héroe lleva
  fuerza y agilidad en `data/heroe.json` y su Defensa primaria suma a la defensa, no a la agilidad.
- **La IA apunta** a la casilla de un enemigo con el mejor daño esperado y sin aliados en la línea.

## Criterios de aceptación

1. **Disparo diferido** (batallas del mapa, de la arena, de la persona, de la IA y del agente):
   1. Un tirador (`isShooter`) puede, en su turno, apuntar a una casilla del tablero; eso cierra su
      turno y deja un disparo pendiente con esa casilla, visible en el tablero para quien juega (la
      casilla elegida y la línea).
   2. Al empezar su siguiente turno, antes de que elija nada, sale el disparo desde la casilla donde
      está, en línea recta hacia la casilla elegida, y da al **primero** que encuentra en ella
      (sin contar al tirador), sea del bando que sea. Si no hay nadie entre él y la casilla (incluida),
      no da a nadie. No sigue más allá de la casilla. Un muro de la muralla que tapa la línea la para.
   3. El daño del alcanzado sale de la horquilla del tirador por la distancia del alcanzado a la
      casilla elegida (decisión de arriba), con ataque contra defensa, suerte y armadura como hoy;
      `double_shot` da dos tiros por la misma línea.
   4. Si el tirador muere o la batalla acaba antes, el disparo se pierde. Tras el disparo, el turno
      sigue: puede apuntar otra vez o actuar como siempre.
   5. El registro, el parte y la animación cuentan el disparo (quién, a qué casilla, a quién dio).
   6. La IA de reglas apunta (criterio de arriba); el agente apunta por su contrato (`battle_turn`),
      y `pnpm qa` pasa. El espectador lo ve (la inversa de la serialización).
   7. **Sin ningún test** del disparo, ni los mínimos. Los tests de hoy que dependan del disparo
      inmediato se borran o se adaptan para no probarlo.
2. **Correr o caminar**: en la batalla (partida, arena y espectador), un tramo de más de la mitad de
   las casillas máximas de esa unidad se anima con el clip de la carga y su ritmo; uno de la mitad o
   menos, caminando y a su ritmo.
3. **Fuerza y agilidad**:
   1. Toda unidad del catálogo y el héroe tienen fuerza y agilidad; la defensa, el daño y las casillas
      ya no se escriben en `data/unidades.json`: se derivan (defensa = agilidad efectiva + escudo +
      efectos; daño = [F, F × agilidad efectiva]; casillas = agilidad efectiva). El ataque se queda.
   2. Toda pieza tiene un peso; ninguna resta movimiento (la `velocidad` de las piezas se va). Las
      armas suman fuerza para el daño en vez de una horquilla de daño.
   3. La agilidad efectiva es la del cuerpo menos lo que reste el peso (regla de arriba), con un
      suelo de 1.
   4. Las 34 unidades y el héroe se ajustan a las cifras nuevas según lo que son (troll fuerte y
      torpe, elfo ágil y flojo…), con cifras inventadas y dichas como tales en el `_comment`.
   5. La ficha de la arena, el editor de equipo, los paneles del juego, `creature_stats` del agente y
      el índice de poder leen las cifras nuevas.
   6. La lanza es un arma de cuerpo a cuerpo; el hueco `lanza` desaparece (datos, contrato, arena).
      Montado con lanza, la carga cobra +10 %/casilla; montado sin lanza o a pie, +5 %/casilla.
4. **Dos armas**: se pueden llevar dos armas de cuerpo a cuerpo de una mano (sin escudo); cada tipo
   de la rueda usa el mejor nivel de las dos, y ataque y fuerza, el mayor. Una a dos manos va sola.
   La arena deja ponerlas, y los jinetes del catálogo llevan espada y lanza.
5. **La rueda del combate teñida**: en el diálogo de la rueda, cada sector se tiñe de rojo a verde
   por el nivel del arma en ese tipo (la misma escala que el editor de equipo, `ruedaDeLaPieza`): con
   las armas de quien mira cuando golpea, con las de su enemigo cuando responde. En las ruedas de 5 y
   de 3, un tipo fusionado con un nivel derivado de sus partes; Normal sin tono.
6. `pnpm verify` en verde, `CLAUDE.md` al día (reglas, puertas únicas, contrato) y `pnpm banco`
   re-anclado diciendo la forma del diff. Se juega en `pnpm dev` y en la arena, con el servidor
   levantado en otro puerto y la URL dada al usuario.

## Fuera de alcance

- El equilibrio y cualquier medida de jugabilidad (`CLAUDE.md`, «No se prueba la jugabilidad»):
  las cifras de unidades y equipo son a ojo.
- Tests del disparo (punto 1), ni mínimos.
- La muralla de la arena más allá de que un muro pare la línea del disparo.
- Subir a origin o fusionar a main.

## Contexto

- Rama `claude/objective-almeida-2011b2`, sobre 54de77c1 + feec6b61.
- Tests: solo lo que impide que el código mienta (validación del catálogo, fronteras de
  `invariantes.test.ts`). Un guardia que cae porque el juego cambió se borra o se adapta.
- Máquina compartida: nada de matar por patrón; las pruebas caras, una vez al cerrar.
- Sin compatibilidad hacia atrás: el formato viejo de unidades, piezas y enlaces de la arena se
  rechaza (sube `VERSION_DEL_ENLACE`).

## Preguntas abiertas (con su suposición)

- ¿Ve el rival el disparo pendiente? **Sí**: la casilla y la línea se ven para los dos (se puede
  apartar o tapar con un aliado).
- ¿Puede apuntar un tirador en contacto? Lo mismo que hoy puede disparar: si hoy no dispara, no apunta.
- ¿Sube el ataque de escala? Se queda en la escala de la defensa nueva (2-7 + escudo); si hace falta,
  se sube por unidad al ajustarlas.
- El tono de un tipo fusionado (ruedas de 5 y 3): la media truncada de los niveles de sus partes.
- Lo que suma cada rango (`porRango`) pasa a fuerza y agilidad donde hoy suma defensa y daño.

## Visto bueno del plan (25-10-2026, decisiones del usuario)

- Plan (`plan.md`) y tabla de cifras (`cifras.md`) aprobados tal cual.
- **PV ×2** en tropa y héroe (héroe 1000 + 200/rango).
- **El precio de la tropa, como hoy**: se cambia solo el divisor de `oroDelIndice`
  (`data/economia.json`) para que la mediana del precio del catálogo quede como la de hoy, dicho en su
  `_comment`. La experiencia, igual.
- **Cada rango suma ataque +1 y fuerza +2**, sin agilidad.
