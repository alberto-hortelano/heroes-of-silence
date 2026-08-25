# Requisitos — la IA de batalla decide mejor

**Issues**: #49 (la moral se calcula una vez y no se recalcula al morir un
stack), #50 (la IA elige la primera casilla de ataque, no la que más carga) y
#52 (el `wait` de la IA está implementado y su cola no se alcanza nunca).

## Petición literal del usuario

> «Sigue con el backlog, elige y prioriza proximas tareas y continua de forma
> autonoma, yo voy a estar fuera unas horas, haz cosas que no necesiten de mi
> feedback y lo que surja lo dejas apuntado para que lo vea al final. Ten en
> cuenta que unas horas mias equivalen a varios dias de trabajo de agentes»

Tercero de los cuatro racimos. Los tres issues tienen en común algo más fuerte
que la carpeta: **el motor ya sabe hacer lo que hace falta y la IA no lo usa**.
`charge` existe y nadie elige la casilla que lo cobra; `wait` existe con test y
no se juega nunca; la moral se calcula bien y no se vuelve a mirar.

## El coordinador hace también de usuario, y se anota

El usuario está fuera. Los puntos de control humanos los resuelvo yo y cada
decisión tomada en su nombre queda escrita al final de este documento.

## Reencuadrado por la crítica (`critica.md`)

El crítico midió **200 semillas = 802 batallas y 10 440 decisiones**, más 200
batallas sintéticas, con contadores que no alteran ninguna decisión. Cuatro
cosas cambian el trabajo:

1. **#52 se queda, y da para el ciclo entero.** Mi sospecha de que el motor no
   cediera la iniciativa **es falsa**: `wait` hace `s.waited = true` y
   `state.queue.push(s.id)`, y `advance` saca por `shift` (`battle.ts:370-374`).
   Comprobado ejecutando: un campeón que espera pasa de 1º a 6º de la ronda.
   Y la cifra del issue aguanta: **0 de 10 440**. Es peor de lo que dice —
   `defend` **tampoco sale nunca**: está muerta **toda** la cola de la heurística.
2. **#50 no tiene sujeto.** `charge` **no pisa el tablero ni una vez** en 802
   batallas: cero cavalry, champion, paladin, crusader, vampire, lich y bone
   dragon. Entra igual, pero **como corrección latente** y con la exigencia de
   salir byte a byte idéntico.
3. **#49 SALE del racimo.** 2 ejércitos mixtos de 1604 (**0,12 %**), y su único
   efecto posible es +1 de moral a los stacks caballero, porque las diez
   criaturas nigromantes son `undead` con `morale: 0` forzado.
4. **Y lo que más vale de la pasada no es ninguno de los tres**: la partida dura
   **7 días de mediana** y `knight_dwelling_5` no se construye en **ninguna** de
   las 200 semillas. **La mitad del bestiario no se juega nunca.** Esa es la
   causa de que #50 no tenga a quién aplicarse y el mismo hecho que #60 ve desde
   el arnés. Va a issue aparte y no se toca aquí.

## Lo que separa este ciclo del anterior, y hay que decirlo

El ciclo de rendimiento exigía que las 40 partidas del barrido salieran **byte a
byte idénticas**. Aquí es al revés: **se espera que cambien**, porque la IA va a
decidir otra cosa. Eso quita la red de seguridad más barata que tiene este repo,
así que la sustituye una medida: el barrido no compara igualdad, compara
**calidad**.

## Criterios de aceptación

### #50 — la casilla que más carga · **corrección latente**

0. **Contexto medido, para que nadie se lleve una sorpresa**: esto **no cambia ni
   una partida hoy**. 0 de 1256 decisiones de «acercarse y golpear» son de una
   unidad con `charge`. Entra porque es correcto y porque el día que la
   caballería llegue al tablero vale **+20,3 %** de daño medio (máx. +36 %,
   medido con ejércitos sintéticos de `cavalry`+`champion`+`paladin`). Y entra
   con una exigencia dura: **el barrido tiene que salir byte a byte idéntico**.
1. Al acercarse y golpear en el mismo turno, la IA elige la casilla de ataque
   que **maximiza el daño esperado**, no la primera de la lista.
2. Para una unidad con `charge` eso es, en la práctica, la que más hexes recorre
   —el bono va con la distancia y topa en +50 %—, pero el criterio se escribe en
   daño esperado y no en distancia: una unidad **sin** `charge` no debe ponerse a
   dar rodeos, y con el criterio mal escrito lo haría.
3. Los empates se resuelven de forma **determinista y documentada**. Y esto no es
   un detalle de acabado: `computeDamage` no depende del hex salvo por
   `chargeHexes`, así que **sin `charge` todas las casillas empatan**.
   **1194 de 1194** decisiones con más de una casilla son de unidades sin carga:
   **el desempate decide hoy el 100 % de los casos y el criterio 1 no decide
   ninguno.** Un desempate por «más hexes» mandaría de rodeo a esas 1194
   decisiones y reventaría la comparación byte a byte.
3b. **El desempate que hay que conservar es el de hoy**: la IA elige la casilla de
   **coste mínimo** en 1698 de 1698 casos, porque `reachable` llena su `Map` por
   BFS y `movableHexes` conserva ese orden. Ojo: eso es un **accidente del orden
   del BFS, no un contrato**. El código nuevo **no debe apoyarse en «el primer
   elemento de `legalActions`»** —tiene que leer el coste—, entre otras cosas
   porque el ciclo de rendimiento está reescribiendo por dentro esa cola.
4. Test determinista: una caballería con dos casillas posibles, la lejana pega
   más, la IA la elige; y la misma escena con una unidad sin `charge`, donde la
   IA **no** se aleja.

### ~~#49 — la moral se recalcula al morir un stack~~ · **FUERA DEL RACIMO**

5. Los criterios 5 a 9 se retiran. Motivo medido: **2 ejércitos mixtos de 1604
   (0,12 %)**, y son la misma hueste en dos batallas seguidas; 0 de 400 en las
   sintéticas. Además hay dos facciones y **las diez criaturas nigromantes son
   `undead`**, que llevan `morale: 0` forzado en un ejército mixto: lo único que
   #49 puede devolver es **+1 de moral a los stacks caballero** al morir el
   último nigromante — o sea 1/24 de turno extra durante ≤8 rondas. La rama
   `-(factions.size - 2)` de `armyMorale` es directamente **inalcanzable** con
   dos facciones.
   El issue **no se cierra**: es correcto y se queda esperando a que los
   ejércitos se mezclen de verdad, que es lo mismo que esperar a que las partidas
   duren. Se comenta con esta medida y se enlaza con la causa.

### #52 — el `wait` que no se juega

10. Se **mide primero**: con el código de hoy, cuántas veces sale `wait` en N
    batallas de la IA contra sí misma. El issue dice 0 de 1043 en 80 batallas.
    Si la medida de hoy no lo confirma, manda la de hoy y el issue se corrige.
11. La condición pasa a modelar la regla del original: esperar sirve para **ceder
    la iniciativa** y golpear después de que el enemigo se comprometa, con
    tiradores y unidades lentas. No es «no alcanzo a nadie ni puedo acercarme»,
    que es una tautología defensiva.
12. Tras el cambio, `wait` se juega **alguna vez** en el barrido, y se dice
    cuántas. Una heurística que sigue saliendo 0 veces no está arreglada.
13. Y no empeora: ver el criterio 15.

### La red que sustituye a «byte a byte»

14. `npx tsx tools/qa/barrido-semillas.ts` sigue dando **0 partidas sin
    terminar** de 40. Ese número es hoy la línea base y **una sola semilla que no
    termine es una regresión**, no ruido.
15. La IA nueva no juega peor que la vieja, y se **demuestra** — pero **a nivel de
    batalla, no de partida**, que es donde vive el cambio. Las dos tácticas se
    enfrentan en batallas sintéticas, cada emparejamiento **dos veces con los
    bandos intercambiados** (el atacante gana los empates de velocidad,
    `battle.ts:232`). **4000 batallas ≈ 7 s y dan ±2,2 pp.**
    Mi versión original —40 semillas de partida— era la medida equivocada por un
    orden de magnitud: distinguir 55 % de 50 % pide **783 partidas**, y 40 dan
    **±15,5 pp**. Peor: a nivel de partida habría que meter la táctica por bando
    en `GameContext` y bajarla dos capas, dejando sin definir qué táctica lleva
    el monstruo neutral —cuyo bando no tiene dueño—, y **devolvería 50,0 % por
    construcción**, porque #50 es byte a byte idéntico.
    **Se dice claro en el informe: esta medida mide #52.**
16. `pnpm verify` verde: los 208 tests más los nuevos. Si algún test existente
    cambia de resultado porque la IA decide otra cosa, **se mira uno a uno** y se
    justifica en `implementacion.md`: un test de batalla que cambia puede ser la
    mejora o puede ser el bug.

## Fuera de alcance

- **La IA estratégica** (`core/ai/strategy.ts`): a quién ataca en el mapa, qué
  construye, a dónde va. Aquí solo se toca la táctica de batalla.
- **Rendimiento.** Va en su propio ciclo, antes que este. Si aquí aparece algo
  lento, se apunta a issue y se sigue.
- **Hechizos nuevos, criaturas nuevas, rasgos nuevos.** `charge`, `fear`,
  `curse_on_hit` y `splash_shot` ya existen y no se tocan.
- **El asedio** (#7), **huir y rendirse** (#19).
- **La duración de la partida y la economía de la IA.** Quedan fuera, y hay que
  decir por qué se nombran: son **la causa** de que #50 no tenga sujeto y de que
  el arnés de #60 se acabe el día 3. Va a issue propio.
- **0 € de fal.ai**, nada de `tools/gen/`, nada de arte.

## Preguntas abiertas, con su suposición por defecto

- **¿Es #52 arreglable sin abrir la caja de la iniciativa? — RESUELTO: sí.** El
  motor **sí** cede la iniciativa, comprobado ejecutando. Lo único que cambia es
  **cuándo la IA lo elige**. Queda una decisión que no es un bug y que hay que
  tomar y escribir: entre varios que esperan, el orden hoy es **FIFO de cuándo
  esperaron**, no por velocidad, y eso **no está contrastado con fheroes2**.
- **¿«Daño esperado» incluye la represalia que te van a devolver?** *Por defecto
  no*: la heurística de hoy no la modela y meterla aquí es cambiar de tarea. Se
  apunta a backlog.
- **¿Qué pasa si la IA nueva gana el 50 % justo?** *Por defecto se acepta si
  además el juego se ve mejor* —`wait` se juega, la carga se cobra— y se dice
  claramente que la mejora es de comportamiento, no de fuerza.
- **¿Cuántas semillas hacen falta para que el criterio 15 signifique algo? —
  RESUELTO**, y mi «más de 40» se quedaba corto por un orden de magnitud: 783
  partidas para distinguir 55 % de 50 %. Ver el criterio 15 reescrito.
- **Aviso sobre el test que se va a quedar mintiendo**: `test/battle.test.ts:895-905`
  alcanza la cola de la heurística **colocando los stacks a mano** hasta que
  `movableHexes` devuelve `[]`. Si la condición cambia, deja de probar lo que
  dice su nombre. **Se reescribe, no se adapta.**
- **Aviso sobre las rondas**: un `wait` que se juega **alarga las batallas**. El
  tope es `MAX_ROUNDS = 100` y el peor caso medido hoy son **8 rondas**. Hay
  margen, pero esa cifra la imprime el barrido y **hay que mirarla**, no solo el
  «sin terminar».

## Decisiones tomadas en ausencia del usuario

1. **~~Los tres issues van juntos.~~ Van DOS: #52 y #50. #49 sale.** Mi argumento
   era que compartían la medida que los valida; el crítico demuestra que esa
   medida **no puede validar a dos de los tres**, porque #49 y #50 salen byte a
   byte idénticos. Lo que de verdad comparten #52 y #50 es otra cosa, y es mejor
   argumento: **los dos son la cola muerta de la misma heurística**.
2. **#49 se queda abierto, no se cierra.** Es correcto; lo que no tiene es
   ocasión de dispararse. Se comenta con la medida y se enlaza a la causa.
3. **El criterio 15 —enfrentar la IA nueva contra la vieja— sigue siendo mío,
   pero mal dimensionado.** Lo mantengo con la forma que dice el crítico: a nivel
   de batalla, con bandos intercambiados. Y con la advertencia escrita de que
   **mide #52 y nada más**.
4. **Este ciclo va DESPUÉS del de rendimiento, y ahora es obligatorio y no
   preferencia.** #52 cambia el 33,3 % de las decisiones, así que **evapora la
   línea base byte a byte** que el ciclo de rendimiento necesita. Al revés no hay
   problema.

---

## Decisiones sobre el plan (`plan.md`), aprobado en ausencia del usuario

Aprobado tal cual. El arquitecto no razonó el plan: **montó las tres variantes
candidatas en una copia del árbol y las jugó** —200 partidas, 10 440 decisiones,
hasta 5000 batallas de banco—, así que lo que hay que anotar son sus medidas.

5. **La regla de `wait` elegida es la B**, y reencuadra el enunciado de los
   requisitos: *no alcanzo a nadie este turno, y hay un enemigo que **todavía no
   ha actuado** cuyo alcance cubre mi hex o la casilla a la que iba a avanzar*.
   Se juega **476 veces en 200 partidas** (4,4 % de las decisiones) y gana
   **51,9 % ± 1,4** contra la táctica de hoy. Las otras dos: la estrecha da
   50,6 % ± 1,4 —indistinguible de cero— y la ancha juega **peor**.
6. **Y con ella se cae el ejemplo que yo había escrito.** Los requisitos decían
   «típicamente con tiradores y unidades lentas», copiando al original. Medido,
   la espera solo la puede aprovechar **quien tenga enemigos detrás en la cola**:
   o sea **el rápido**, no el lento ni el tirador. Queda dicho para que nadie
   herede el ejemplo equivocado.
7. **`defend` se queda como única cola terminal** y el `wait` tautológico se
   borra. Esperar cuando nadie puede llegarte no compra nada; el +20 % de defensa
   sí. Eso responde a la pregunta que dejé abierta sobre qué pasaba con la cola
   muerta entera.
8. **El orden total de #50 es explícito y de tres niveles**: máximo daño esperado
   → coste mínimo → primero en el orden de enumeración. El tercer nivel decide
   hoy el **60 %** de los casos (**722 de 1194** decisiones multi-casilla empatan
   a coste mínimo), así que no es un detalle de acabado: es el criterio.
9. **La identidad byte a byte de #50 está comprobada**, no prometida: sha256 de
   ganador y día de 200 partidas más el log completo de 200 batallas dan
   `9579fb4b7cb32511` **con y sin** el cambio.
10. **El banco de enfrentamiento trae su propia prueba de que no está sesgado**:
    con la misma táctica en los dos bandos da **50,0 % exacto** (1000 de 2000).
    Eso era justo lo que hacía falta para que el criterio 15 signifique algo.
11. **Un hallazgo que no estaba en ningún issue y que entra**: `notaAccionSustituida`
    (`src/server/notas.ts:262`) le dice al agente «Eso ha consumido el turno»,
    y con una sustituta `wait` **eso es mentira**. Hoy no se ve porque `wait` no
    sale nunca; en cuanto salga, el agente recibirá una explicación falsa de qué
    le costó su error. Entra con test y con `pnpm qa` obligatorio.

**Orden de ejecución**: este ciclo va **después del de rendimiento**, como ya
estaba decidido. Y **antes** del de economía (#66/#68), invirtiendo lo que había
pensado: la identidad byte a byte de #50 ya está comprobada contra el árbol de
hoy, y el ciclo de economía cambia todas las partidas, así que ejecutarlo primero
obligaría a rehacer esa comprobación sin ganar nada.
