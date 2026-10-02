# Mover en tramos y elegir desde dónde atacar

## Petición literal

El usuario, jugando en el navegador (02-10-2026):

> «No veo como puedo moverme y atacar. Puedo atacar a un enemigo que este lejos y
> entonces me muevo y ataco pero si quiero reposicionarme y atacar desde otro
> angulo no puedo, no deberia acabar el turno de un personaje solo con moverse si
> le quedan mas movimientos o ataques, deberia mostrar donde se va a situar para
> atacar a un enemigo y poder elegirlo como en el HoMM, pero en lugar de con una
> flecha en el raton, resaltando la casilla desde la que atacaria»

Decisiones del usuario:

- **Turno:** «Mover en tramos y atacar una vez».
  - La velocidad es un presupuesto de casillas por turno. La unidad puede
    moverse varias veces hasta gastarlo y, en cualquier momento, atacar,
    moviendo lo que le quede para llegar.
  - **Atacar acaba su turno.** También se puede terminar a mano.
- **Ángulo:** «Al pasar por el enemigo».
  - Al poner el ratón sobre un enemigo se resaltan todas las casillas desde las
    que se le puede golpear.
  - La más cercana al ratón queda marcada fuerte, y desde ahí se ataca al hacer
    clic.
  - Es un clic, como en HoMM, pero sin flecha.

## Criterios de aceptación

1. **Regla de núcleo: el movimiento no acaba el turno.**
   - `move` gasta casillas del presupuesto del turno de esa unidad y deja el
     turno abierto mientras quede algo que hacer: más movimiento, atacar o
     disparar.
   - Si `move` agota el presupuesto y no queda ningún objetivo al alcance, el
     turno acaba solo. Que no haga falta un clic de más sin motivo.
   - `attack` (con o sin `from`), `shoot`, `wait`, `defend` y lanzar acaban el
     turno como hoy, salvo `cast`, que hoy no lo acaba y sigue igual.
   - Hay una acción explícita para terminar el turno de la unidad.
   - Lo gastado **no se guarda como campo suelto** que haya que resetear en dos
     sitios. Lee el aviso del comentario de `recorridos` en `battle.ts`. El
     arquitecto decide dónde vive, sabiendo que lo recorrido influye en la carga
     (`charge`) del golpe.
   - Las respuestas, la iniciativa, `wait` y la carga siguen siendo coherentes.
     La carga cuenta lo recorrido en el turno entero, no solo el último tramo; el
     arquitecto lo decide y lo escribe.
2. **`legalActions`** refleja el presupuesto restante, y el contrato del agente
   también:
   - prosa en `RESPONSE_FORMAT`;
   - el agente puede mandar varios `move` en el mismo turno de la unidad;
   - se le pide acción otra vez mientras el turno siga abierto.
3. **IA de batalla:** sigue jugando bien con la regla nueva y la puede aprovechar.
   Como mínimo no empeora; medido con `tools/qa/enfrentamiento.ts`.
4. **Cliente: elegir el ángulo.**
   - Al pasar el ratón sobre un enemigo atacable cuerpo a cuerpo, se resaltan
     todas las casillas `from` válidas.
   - La más cercana al puntero, dentro del hexágono del enemigo, se marca fuerte
     y la barra dice desde dónde golpearía.
   - El clic ataca desde esa casilla.
   - Si hay disparo, el clic dispara como hoy. Si la unidad ya está pegada, la
     casilla actual es una opción más.
   - `accionContra` deja de elegir sola el `from`. La regla de qué casilla está
     «más cercana al ratón» vive en un sitio puro y testeable, que también usa
     `pnpm capturas`.
5. **Cliente: mover en tramos.** El clic en una casilla vacía alcanzable mueve, y
   la misma unidad sigue activa con lo que le queda resaltado. Hay un botón o
   tecla para terminar su turno.
6. **Se ve y se mide.**
   - `pnpm capturas` recorre mover dos tramos y atacar desde un ángulo elegido.
   - Banco re-anclado una vez, mirando la forma.
   - Barrido 0/40 y medida de duración y ganador con 100 semillas (decisión del
     usuario: las medidas van con 100).
   - `pnpm qa` cruza un turno con dos `move` del agente.

## Fuera de alcance

- Los modos de combate (defensa, equilibrado, ataque) del cuaderno.
- Retirada, hostigar y las habilidades: es el motor de habilidades.
- Moverse **después** de atacar: decisión del usuario, «atacar acaba su turno».

## Contexto

- Va después del ciclo del equipo, que está corrigiendo hallazgos de QA. Se lanza
  cuando ese ciclo esté commiteado.
- El motor ya admite `attack` con `from`, y hoy el cliente lo elige solo
  (`accionContra` en `escenas/batalla.ts`).
- `move` hoy acaba el turno (`battle.ts`, `case 'move'`, con `endTurn`).

## Decisiones del usuario sobre el plan (02-10-2026)

- **Disparar después de moverse: «No».** Un tirador que se ha movido en este turno
  ya no dispara. Puede golpear cuerpo a cuerpo, seguir moviéndose o terminar.
- **Defender o esperar después de moverse:** «Ni defender ni esperar».
- **La carga, literal:**

  > «La carga se muestra al mostrar el movimiento posible y solo se puede cargar si
  > hay 3 o mas casillas y solo en linea recta, en las 8 direcciones, pero no
  > haciendo giros, se puede mover un tramo y se vuelve a calcular.»

  - La carga **se calcula por tramo**: el del ataque, desde donde está la unidad
    al empezar ese tramo. Lo recorrido en tramos anteriores no cuenta, porque
    cada tramo vuelve a calcular.
  - Solo hay carga si la casilla de ataque está **en línea recta** desde la
    posición actual, a 3 casillas o más y **sin giros**.
  - En un tablero de hexágonos las líneas rectas son las **6 direcciones** de
    las caras. El usuario dijo «8 direcciones», pensando en casillas cuadradas.
    El arquitecto lo implementa con las líneas rectas del tablero hexagonal y se
    le comunica al usuario. Si quiere también las 6 diagonales entre vértices,
    lo dirá.
  - **Se muestra al enseñar el movimiento posible**: las casillas desde las que
    se cargaría se distinguen en el resaltado (cliente), y el agente las recibe
    en su `legalActions` o en un campo del turno.
  - Sustituye a la carga actual (`chargeHexes`, que cuenta lo recorrido). Sigue
    siendo de las criaturas con el rasgo `charge`.

## La IA y la carga (decisión del usuario, 02-10-2026)

Con la regla de H1 la IA dejó de cargar: 0 cargas en 203 golpes del banco.
Elige el objetivo antes que la casilla, y en 10 de esos golpes había una carga
posible contra otro enemigo. El usuario: **«Sí, en este ciclo»**.

- Al elegir objetivo, la IA cuenta el daño con carga cuando el enemigo está en la
  recta. Lee la misma regla (`casillasDeCarga` / `cargaDesde`) y no la copia.
- Entra solo si `enfrentamiento.ts` da un intervalo entero por encima del 50 %
  contra la IA de ahora.
- Se re-anclan las partidas una vez, mirando la forma del diff. Se publican las
  cargas cobradas y `tamanos 28 100`.
