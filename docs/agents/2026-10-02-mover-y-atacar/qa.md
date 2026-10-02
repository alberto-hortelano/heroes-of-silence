# QA — mover en tramos y elegir desde dónde atacar

Base: `main` en `ee5aa5e` con el trabajo sin commitear (34 ficheros modificados, 3 nuevos).
Lo validé contra la cita literal de `requisitos.md` y las decisiones del usuario.
El navegador lo probé con **`pnpm dev` (puerto 3100) y Playwright**: ratón real
(`mouse.move`/`click`/`dblclick`), teclado real (`keyboard.press(' ')`) y la consola vigilada.
Las sondas vivieron en el scratchpad y ya están retiradas. El worktree temporal de `main`
también está retirado, y el vite que arranqué está muerto (puerto 3100 libre, comprobado).

## Criterios

| # | Criterio (literal) | Estado | Evidencia |
|---|---|---|---|
| U1 | «no debería acabar el turno de un personaje solo con moverse si le quedan más movimientos o ataques» | ✅ | Semilla 282, día 1, batalla contra la guardia de (9,6). Héroe en (0,4): clic en (1,4) y sigue el **mismo turno** (`turno.n` 1→1, gastado 1). El panel dice «Le quedan 3 casillas». En las tres semillas probadas (282, 93, 177) salieron 20 o más tramos de una casilla, y cada uno dejó el turno abierto con el contador bajando 4→3→2→1→0. |
| U2 | «deberia mostrar donde se va a situar para atacar … resaltando la casilla desde la que atacaria» | ✅ | `qa-01-angulo-tres-candidatas.png`, semilla 282, ronda 2, héroe en (4,4) contra el zombi `defender-0`. Las 3 candidatas (7,3), (7,4) y (7,5) salen en amarillo suave y la elegida en amarillo fuerte. |
| U3 | «poder elegirlo … al pasar por el enemigo, la más cercana al ratón marcada fuerte, y desde ahí se ataca al hacer clic» | ✅ | Barrí los píxeles de la figura de cada enemigo con `objetivoEn`/`anguloEn` de la escena viva. En **todos** los casos medidos cada candidata tiene una región del puntero que la elige: 3/3, 4/4, 5/5, 6/6 y 8/8 (este último contra un dragón óseo de 2 hexes). Clic de verdad en una casilla que no es la primera de la lista: «CLIC en 7,5: llegó a 7,5 OK». 9 golpes desde ángulo en 4 partidas, 9/9 desde la casilla resaltada. |
| U4 | La barra dice desde dónde golpearía | ✅ (con reserva H4) | Al pasar por las tres candidatas la barra dice «Golpearías desde (7,3).», «(7,4).» y «(7,5).». Con carga dice «Golpearías desde (7,2), cargando 3 casillas (+30 % de daño).» |
| U5 | Si hay disparo, el clic dispara como hoy | ✅ | Arquero `attacker-2` sin moverse: clic sobre `defender-1` y el evento es `shoot`. |
| U6 | Si ya está pegada, la casilla actual es una opción más | ✅ | Caballería en (7,5) pegada: «candidatas=7,5,7,4,7,3,9,4». El clic en la región de (7,5) da `attack` sin `move`. |
| U7 | Terminar turno a mano: botón y tecla | ✅ | 4 veces con el **botón** y 4 con **Espacio** en la 282, y otras tantas en la 177. Siempre `turno.n` +1 y pasa a la siguiente unidad. Un Espacio pulsado con el foco en el botón no cierra dos turnos: 27→28, uno solo. |
| U8 | Si `move` agota el presupuesto sin objetivo al alcance, el turno se cierra solo | ✅ | Héroe (1,4)→(4,4) con 3 casillas: agota y se cierra (n 1→2, sin clic de más). Con 0 casillas y un enemigo al lado **sigue abierto**, con la lista `attack` + `end_turn` (#38: «quedan=0 atac=defender-2»). |
| D1 | «Un tirador que se ha movido ya no dispara» | ✅ (con reserva H2) | Arquero en (0,2)→(1,2): `shoot` desaparece de la lista y el clic sobre un enemigo lejano no dispara (0 eventos). Por el agente, `shoot` tras moverse se rechaza con «attacker-4 ya se ha movido este turno: no puede disparar». |
| D2 | «Ni defender ni esperar» tras moverse | ✅ | `qa-02-tirador-movido.png`: Defender y Esperar salen apagados (`isDisabled()=true` en cada tramo de 3 semillas) y no están en la lista legal. Por el agente, `defend` tras moverse se rechaza («ya se ha movido este turno: no puede defenderse»). |
| D3 | Carga: «se muestra al mostrar el movimiento posible», en línea recta, 3 o más casillas, sin giros, recalculada por tramo | ✅ (con hallazgo H1) | Ver la nota *Cómo vi la carga*. Caballería en (0,5) (fila impar): marcas »3/»4/»5 en la recta E (3..7,5), en la NE (2,2), (2,1) y (3,0) y en la SE (2,8). Las comprobé a mano en odd-r. Golpe desde (7,5) en recta de 7: `attack(charge=5)`, el tope. **Tras un tramo** de 1 a (8,5), golpe desde (7,2), que está en la recta NW de 3: `attack(charge=3)`, así que se recalcula desde el inicio del tramo. Un golpe desde (9,4), que no está en recta: sin carga. Capturas `qa-03` y `qa-04`. |
| C1 | `cast` sigue sin acabar el turno, también tras un tramo | ✅ | Héroe: tramo a (1,4) y luego Flecha mágica con clic. Sigue en `turno.n` 1, gastado 1, 3 casillas y 20 movimientos legales. |
| C1 | Moral extra coherente | ✅ (con reserva H5) | Semilla 177: el héroe termina con el botón (n 28) y la moral le da el n 29 con «Le quedan 4 casillas» y Defender/Esperar encendidos, o sea un turno nuevo y entero (`qa-06-moral-extra.png`). |
| C1 | Lo gastado no es un campo suelto | ✅ | `BattleState.turno = {stack, gastado, n}` lo crea solo `advance`. Lo revisé en código; los guardias que rompió el ingeniero están en `implementacion.md`. |
| C2 | Agente: varios `move`, prosa, se le vuelve a pedir | ✅ | `pnpm qa`, exit 0 en 3,09 s: «38 veredictos, 38 entraron, 0 descartadas», «turno en tramos: 17 veces dos "move" seguidos en el mismo "turnId", los dos aceptados». La prosa de `battle_turn` nombra `end_turn`, `stepsLeft`, `turnId` y `chargeFrom`, y coincide con lo que hace el motor. |
| C2 | Agente adversarial: `move` fuera de presupuesto, `shoot`/`defend` tras moverse | ✅ | Una sonda pasó por el `Director` real con un enlace falso (semilla 7, 30 peticiones). (1) `move` a (10,0) rechazado: «no puede moverse a (10,0)», la sustituta se juega y la nota lo dice. (2) `shoot` tras un tramo rechazado con la frase del motor. (3) `defend` tras un tramo rechazado. (4) La sustituta `move` que deja el turno abierto dice «Eso NO ha cerrado el turno de attacker-5: le quedan 0 casillas…» y la petición siguiente llega con el mismo `turnId`. Ninguna petición colgada; la batalla termina. |
| C3 | La IA no empeora | ✅ | `enfrentamiento.ts` da «50.85 % ± 0.49 pp (IC 95 % pareado)» y el intervalo queda entero por encima del 50. Reserva: 975 de 1000 parejas empatan, así que la medida discrimina poco. |
| C6 | `pnpm verify` | ✅ | `Tests 1023 passed \| 1 skipped (1024)`, 12,5 s. |
| C6 | Banco re-anclado una vez | ✅ | `pnpm banco`: `sha256 656e567e…`, «ancla: igual», 0/200 sin terminar, 9 / 17 / 37 días. |
| C6 | Barrido 0/40 | ✅ | `sin terminar: 0/40 → []`, 8 / 18 / 23 días. |
| C6 | Duración y ganador con 100 semillas | ✅ | `tamanos.ts 28 100`: ahora `8 / 16 / 25 · 0/100 · j0 43`. En un worktree de `ee5aa5e` daba `8 / 15 / 30 · 0/100 · j0 43`. Mismo ganador y misma mediana; el p90 sube un día y el máximo baja de 30 a 25. |
| C6 | `pnpm capturas` recorre dos tramos y el ángulo | ✅ | Exit 0 en 98,2 s, «sin errores en consola»: «dos tramos: attacker-heroe sigue activo — «Le quedan 2 casillas»», «ángulo: la barra dice «Golpearías desde (7,3).»». |
| — | Espectador | ✅ | Va dentro de `pnpm capturas`: «5 final(es) de batalla vistos, 86 turnos de batalla», sin errores. En `espectador-02-batalla` la unidad activa está marcada. |
| — | Consola del navegador | ✅ | 0 errores en las 9 pasadas de Playwright con `pnpm dev`. |

### Cómo vi la carga

La persona juega el caballero, y su ejército de salida no lleva caballería: solo
llega con la morada 5, después de varios días de construir. Para verla le **cambié al
héroe el ejército antes de la batalla**: Caballería + Campeón + 2 campesinos. Lo hice
desde la sesión expuesta y después todo fue con clics reales. Ver *Workarounds*.

## Hallazgos

### Importantes

**H1 — Las casillas naranjas prometen un golpe que el clic no da.**
Al pasar por una casilla de carga, la barra dice «Desde aquí golpearías cargando 5
casillas (+50 % de daño).», y el panel enseña «Las casillas naranjas cargan». Pero el
clic en esa casilla **solo mueve**. Desde ese momento la carga está perdida para este
turno: el golpe desde donde está la unidad no carga, y el siguiente tramo vuelve a
medir desde ahí.

- Reproducción:
  1. Semilla 282 con la caballería forzada.
  2. Ronda 2: el Campeón está en (0,5) y el zombi en (8,4).
  3. Pasar el ratón por (7,5), una casilla marcada «»5» y pegada al zombi.
  4. Hacer clic.
- Lo que pasa: el evento es `move` y nada más. El turno sigue abierto y `cargas` queda
  vacío. Ahora solo se ofrece `attack` sin `from`, que no carga. Captura:
  `qa-05-casilla-naranja-junto-al-enemigo.png`.
- Lo que esperaba quien juega: cargar con +50 %. La frase «golpearías» y el color le
  invitan a pulsar justo ahí. El gesto que sí carga es otro: pasar por el **enemigo** y
  pulsar con esa casilla resaltada. Ese gesto funciona (U3/D3).
- Además, la mayoría de las marcas no tienen a nadie al lado. En la ronda 1, las 9
  casillas naranjas del Campeón están lejos de cualquier enemigo (`qa-03`), y la barra
  dice «golpearías» igualmente.
- La regla literal («se muestra al mostrar el movimiento posible») sí se cumple. Lo
  engañoso es el texto y el clic. Salidas posibles, a decidir:
  - que la barra diga «si atacas desde aquí…» y nunca «golpearías» en una casilla sin
    enemigo al lado;
  - o que el clic en una casilla de carga pegada a un enemigo se lea como golpe a ese
    enemigo.

**H2 — El tirador que se ha movido recibe un motivo falso.**
Tras un tramo, el clic sobre un enemigo dice «No alcanzas a esa unidad este turno.»
(`escenas/batalla.ts:382`, una frase fija). El motor sí tiene el motivo bueno, «ya se ha
movido este turno: no puede disparar», y es lo que recibe el agente.

- Reproducción:
  1. Semilla 282, ronda 1, turno del Arquero `attacker-2` en (0,2).
  2. Clic en (1,2).
  3. Clic sobre un zombi.
- Quien juega: acaba de decidir que el tirador que se mueve no dispara, pero no lo
  sabrá. Leerá «no alcanzas» con un arco de alcance ilimitado y pensará que es un fallo.
  Ni la barra al pasar ni el texto del panel lo explican. Choca con «fail-loud con un
  mensaje escrito para la persona», que sale del núcleo y no se reescribe en el cliente.

### Menores

**H3 — «Le quedan 1 casillas».** El plural es fijo en el panel y en las notas del
agente («le quedan 1 casillas y se te volverá a pedir acción»). Sale en cada unidad que
anda dos casillas.

**H4 — La barra da coordenadas que el tablero no enseña.** «Golpearías desde (7,5).»:
quien juega no ve ninguna numeración de casillas. El resaltado fuerte lleva la
información y la cifra no le dice nada. Mejor una dirección («por abajo a la
izquierda») o solo la carga.

**H5 — La moral extra no se anuncia donde se mira.** Tras «Terminar turno», la misma
unidad vuelve a estar activa con todo el movimiento y la barra vacía (semilla 177,
ronda 4, n 28→29). Solo lo cuenta el parte de guerra, debajo de la línea de flotación.
Es anterior a este ciclo, pero con tramos confunde más: parece que el botón no ha
hecho nada.

**H6 — Espacio en batalla anula la activación por teclado de los botones con foco.**
Lo leí en el código: el `preventDefault` es incondicional en `main.ts`. Con el foco en
«Rendirse» o «Continuar», Espacio no los pulsa; Enter sí. Es una decisión razonable,
pero conviene saberla.

**H7 — En táctil no hay vista previa del ángulo.** Un toque sobre el enemigo ataca en
el acto desde la casilla más cercana al dedo, sin enseñar antes el resaltado. Funciona
porque se elige por el lado tocado, pero no se ve antes de comprometerse. Fuera del
alcance de la petición, que se hizo en escritorio. Lo dejo dicho.

## Workarounds usados

1. **Exponer la sesión**: Playwright añadía al vuelo una línea a `/main.ts`,
   `window.__qa = {s: () => session, batalla, aventura}`. Solo sirve para leer estado y
   calcular píxeles con las funciones puras del propio cliente. Los gestos fueron todos
   ratón y teclado reales. **No afecta a quien juega.**
2. **Caballería forzada** para D3 y H1: cambié el ejército del héroe en la sesión antes
   de pulsar la guardia. En el juego real la caballería llega con la morada 5, después
   de varios días de construcción. A quien juega no le pone ningún obstáculo que yo me
   haya saltado: solo atajé la economía. Eso sí, **`pnpm capturas` nunca ve una casilla
   de carga en el juego**, y el ingeniero ya lo declaró.
3. **Dragón óseo forzado** como guardia, para comprobar el ángulo contra un enemigo de
   2 hexes: 8/8 candidatas elegibles. El mismo veredicto que el punto 2.
4. **Agente simulado**: un enlace falso sobre el `Director` real y una batalla forzada
   con `forzarBatalla`, para mandar acciones ilegales a propósito. `pnpm qa` cubre el
   circuito de verdad.

## No probado

- **Las 6 diagonales entre vértices**: no existen por decisión (P1). Al usuario hay que
  decirle que «8 direcciones» se implementó como las **6 rectas del hexágono**.
- **Dos Espacios seguidos con dos unidades propias consecutivas**: por el código,
  cerrarían dos turnos, porque `end_turn` no anima y `jugadaEnCurso()` no frena.
  Es como pulsar dos veces el botón. No lo medí.
- **La partida avanzada con caballería obtenida jugando** (sin forzarla): no lo hice
  por coste. Ver el workaround 2.
- **Arte ausente**: no lo probé aparte para este ciclo. Va dentro de `pnpm capturas`
  (`sin-arte-02-batalla`, sin errores).

## Veredicto

**Apto con reservas.** Lo que el usuario pidió jugando funciona en el flujo real, sin
errores de consola y con todas las medidas en verde: moverse en tramos, seguir con la
misma unidad, ver todas las casillas desde las que golpear al pasar por un enemigo y
atacar desde la resaltada. Antes de darlo por cerrado conviene resolver **H1**: el texto
y el clic de las casillas naranjas llevan a perder la carga justo cuando se intenta usar.
También **H2**: el tirador movido recibe un motivo falso.

---

## Segunda pasada

Fecha: 02-10-2026. Base: `ee5aa5e` más el trabajo sin commitear, tras la corrección de
H1, H2, H3 y H6 (`hallazgos-qa.md`, sección «Hallazgos de QA» de `implementacion.md`).
Solo vuelvo a probar esos cuatro hallazgos, con una pasada adversarial nueva.

Cómo lo probé:
- **Navegador**: `pnpm dev` propio en el 3100, arrancado con `set -m` en su propia línea.
  Al acabar lo maté por su grupo (PGID 292378, cwd `/home/al/code/heroes` comprobado) y
  el puerto quedó libre. Usé Playwright con ratón y teclado reales, semilla 35 y la
  consola vigilada.
- **Núcleo**: sondas `tsx` sobre `createBattle` y `serializeBattleTurn`.
- **Banco instrumentado**: lo corrí sobre una **copia** de `src/` en el scratchpad, sin
  tocar el repo.

Retiré todas las sondas. En el repo solo añadí las capturas `capturas/qa2-*.png`.

### Comprobaciones de base

| Comando | Salida real |
|---|---|
| `pnpm verify` | `Tests 1035 passed \| 1 skipped (1036)`, 12,6 s |
| `pnpm banco` | `sha256 290812e6…`, «ancla: igual», `0/200`, `9 / 17 / 37` |
| `pnpm qa` | exit 0 en 3,08 s, «38 veredictos, 38 entraron, 0 descartadas» y «turno en tramos: 17 veces…» |

### Criterios re-verificados

| # | Criterio (literal) | Estado | Evidencia |
|---|---|---|---|
| H1a | «Click sobre una casilla que está en la línea de carga y tiene un enemigo → carga» | ✅ | Navegador, semilla 35. Jinete en (5,6) y rival en (9,6). `battleCharges` = `[{defender-0, (8,6), 3}]`. Con el puntero sobre el rival, del lado oeste, la barra dice «Golpearías desde (8,6), cargando 3 casillas (+30 % de daño).». El clic da `move (8,6)` y `attack charge:3`. Captura `qa2-02`. |
| H1b | «si no hay enemigo solo mueve y no hay carga» | ✅ | Clic en (8,6), la casilla «»3», vacía: solo hay `move`, el turno sigue abierto (`gastado 3`) y la barra no habla de carga. Después de eso `battleCharges` = `[]`: la carga se ha perdido, como dice la regla. Sobre la casilla vacía la barra no promete nada. |
| H1c | «no se puede cargar contra un enemigo que esté al lado» | ✅ | Rival en (6,6), pegado de salida: no se anuncia nada y el clic da `attack` sin `charge`. En el núcleo, con el rival en (8,7), la recta llega a (8,6) y gira: cobra 0 y no se anuncia. |
| H1d | Recta con una unidad en medio | ✅ | Aliado en (7,6). Navegador: sin anuncio, la barra dice «Golpearías desde (8,6).» y el clic, que rodea, da `attack` sin `charge`. Núcleo: con un **enemigo** en medio también cobra 0. |
| H1e | Enemigo en la recta a 2 casillas: no carga | ✅ | Rival en (8,6): no se anuncia nada, la barra dice «Golpearías desde (7,6).» y el golpe sale sin `charge`. |
| H1f | Unidades de 2 hexes: basta una de sus casillas | ✅ | Dragón óseo con la cabeza en la recta, (8,6)(9,6): se anuncia desde (7,6) con 3, la barra dice «+30 %» y el clic real da `charge:3` (`qa2-03`). Por la **cola**, (2,6)(3,6), con el jinete viniendo del este desde (8,6): se anuncia desde (4,6) con 4, la barra dice «+40 %» y el clic da `charge:4`. Con el dragón fuera de toda recta, (9,5)(10,5): nada. |
| H1g | Por tramo, desde donde está la unidad | ✅ | Núcleo. Tramo de (3,6) a (4,6) y después golpe desde (8,6): se anuncia 4 y se cobra 4. Un tramo que sale de la recta deja el golpe fuera del presupuesto. Con 2 casillas restantes no hay carga de 3, y con 3 restantes sí. El tope de 5 se respeta en una recta de 6 (caballería) y de 7 (campeón). |
| H1h | Dos enemigos cargables y el ángulo | ✅ | Rivales en (9,6) y (7,2), con un tercero en (8,7) pegado a la casilla de carga del primero. Se anuncian los dos: (8,6)×3 y (6,3)×3, ambos naranjas (`qa2-04`). La barra dice «+30 %» solo en el par bueno: `defender-1` desde (7,3) no lleva carga. **El tercero desde (8,6)**, que es la casilla de carga de otro, dice «Golpearías desde (8,6).» sin carga, y el clic da `attack` sin `charge`. La carga se cuenta por objetivo y no por casilla. En el barrido de píxeles sobre el rival, la casilla de carga (8,6) es elegible en 149 de 1212 píxeles; las seis candidatas tienen su región. |
| H1i | Agente: `chargeFrom` dice qué objetivo desde qué casilla | ✅ | `serializeBattleTurn`, mismo tablero que H1h: `chargeFrom` = `[{defender-0,8,6,3},{defender-1,6,3,3}]`. Cada uno, aplicado, cobra exactamente lo anunciado. `defender-2` desde (8,6) no sale en la lista y cobra 0. Un `move` a (8,6) deja el turno abierto con `stepsLeft 3` y sin `chargeFrom`. La prosa dice «el "target" está EN ESA RECTA» y «Un "move" a esa casilla NO carga». `pnpm qa` no lleva caballería, así que no lo cruza; lo vigila `agent-contract`. |
| H2 | El tirador movido recibe el motivo del motor | ✅ | Navegador. Arquero (munición 12) de (1,4) a (2,4); clic sobre el rival de (9,4): «Ya se ha movido este turno: no puede disparar, y no alcanza a esa unidad cuerpo a cuerpo este turno.», con 0 hechos nuevos (`qa2-05`). Ojo: con la munición a 0 la frase cambia a «Se ha quedado sin munición, y…», que también es cierta. Al pasar el ratón por el rival la barra no dice nada; el motivo sale al hacer clic. |
| H3 | «Le queda 1 casilla» | ✅ | El panel pasa de «Le quedan · 2 casillas» a «Le queda · 1 casilla» tras un tramo (`qa2-05`). Las notas del agente usan la misma función (`quedanCasillas`); `pnpm qa` imprime «le quedan 3 casillas» en plural. |
| H6 | Espacio con el foco en un botón manda el botón | ✅ | Con el foco en «Terminar turno», Espacio cierra un solo turno. Busqué una trampa nueva: tras pulsar «Defender» o «Esperar» con el **ratón**, ¿se queda el foco en el botón y el Espacio siguiente hace defender o esperar a la unidad siguiente? El panel se repinta y el foco vuelve a `BODY` a los **11 ms** (medido cada 10 ms). Después, Espacio cierra el turno de la unidad nueva sin más hechos. Un clic en el lienzo deja el foco en `CANVAS` y Espacio cierra el turno. Solo un Espacio pulsado en esos 11 ms haría el botón viejo: en la primera sonda, sin espera, salió `defend` para la unidad siguiente. Ninguna persona llega a eso. |
| — | Consola | ✅ | 0 errores y 0 `pageerror` en las cuatro tandas de Playwright. |

### ¿La IA ya no carga nunca? No: carga cuando puede, y casi nunca puede

Medí el banco sobre una copia instrumentada del núcleo (el ancla sale igual,
`290812e6…`):

```
golpes de unidades con charge: 203 · con from: 99 · cargas cobradas: 0
golpes con alguna carga disponible (contra cualquiera): 10 · contra el objetivo elegido: 0
```

En 400 batallas sintéticas con caballería y campeones contra cuatro ejércitos
nigromantes, la IA jugando los dos bandos:

```
2750 decisiones de unidades con charge · 16 con alguna carga disponible
11 cargas cobradas · las 11 con carga contra el objetivo elegido la toman
5 perdidas: la carga era contra otro enemigo que el que elige bestTarget
```

El porqué:
- **`mejorCarga` funciona**: cuando el objetivo que elige `bestTarget` es cargable, carga
  siempre (11 de 11).
- Lo que ha cambiado es **la geometría**. La regla nueva pide que el enemigo esté
  justo en una de las 6 rectas, a 4 casillas o más, con la recta libre y dentro del
  presupuesto. Eso pasa en el **0,6 %** de las decisiones de una unidad con `charge`
  (16 de 2750).
- Antes valía cualquier casilla de la recta pegada al objetivo, y por eso el banco cobraba
  28 cargas de 218.
- La IA no **busca** colocarse para cargar, y además en el banco las 10 oportunidades
  eran contra otro enemigo. Por las dos cosas sale el 0 de 203.
- No es un fallo de este ciclo. Una IA que se coloque o que prefiera al cargable sería
  otra decisión: lo que dice `implementacion.md` es correcto.

Una cifra no cuadra: `implementacion.md` dice `"conFrom":19` y yo cuento **99** golpes
con `from` de 203. Puede que su sonda contara otra cosa. No cambia la conclusión.

### Hallazgos nuevos

**Menores**

- **N1. Lo naranja se distingue poco de lo atacable.** Hay tres tonos de naranja con
  poco contraste entre ellos:
  - el enemigo cargable, en naranja con borde grueso;
  - los enemigos atacables, en salmón;
  - la casilla «»N», rellena del mismo naranja que el enemigo cargable.

  En `qa2-01` el rival cargable se reconoce sobre todo por el borde. Además, el «»3»
  cae a menudo encima de la barra de vida o la cabeza de la figura de la fila de
  delante (`qa2-01`, `qa2-04`). Es cosa de arte. Se lee, pero cuesta.
- **N2. El texto de ayuda habla de cargar en todas las batallas**, también con un
  campesino o un arquero activos, que no tienen el rasgo («Al enemigo en naranja se le
  puede cargar…»). Para quien juega es ruido hasta que tiene caballería, varios días
  después.
- **N3. Al pasar por un enemigo que no se puede atacar, la barra no dice nada.** El
  motivo de H2 solo sale al hacer clic. No lo pedía el hallazgo; quien explora con el
  ratón lo agradecería.

**Ningún bloqueante ni importante.**

### Workarounds usados

1. **La sesión expuesta**, `window.__qa`: una línea añadida al vuelo a `/main.ts` con
   `page.route`, la misma que en la primera pasada. Con ella leí el estado y calculé
   píxeles con las funciones puras del cliente. Los gestos de prueba fueron todos de ratón
   y teclado reales. **No afecta a quien juega.**
2. **Entrar en la batalla con `clickTile({8,9})`** desde la sesión, en vez de clicar el
   mapa. El camino hasta la batalla no es lo que se valida aquí, y ya lo recorre
   `pnpm capturas`. **No afecta.**
3. **Geometrías montadas a mano**:
   - cambié la criatura activa (caballería, arquero, piquero) y, en el arquero, le puse
     la munición;
   - recoloqué los stacks y vacié la caché de la sesión;
   - hice dragón óseo al rival.

   Es estado sintético. Sin él no hay caballería ni dragón en una batalla del día 1, y
   los casos adversariales (recta de 2, unidad en medio, dos cargables) no se pueden
   provocar a voluntad. Mismo veredicto que en la primera pasada: la economía
   **sí** pone ese obstáculo a quien juega, pero es anterior y ajeno a la regla.
   Lo que se probó (anuncio, barra, clic y cobro) corre por el código real.
4. **Copia instrumentada del núcleo** para contar cargas en el banco. Fuera del repo y
   ya borrada.

### No probado

- **La caballería conseguida jugando**, en una partida avanzada: no la probé, por coste,
  igual que en la primera pasada.
- **`chargeFrom` a través del puente MCP real**: el arnés de `pnpm qa` no lleva unidades
  con `charge`. Lo probé con `serializeBattleTurn` y lo vigila `agent-contract`.
- **Táctil y móvil para la carga**: fuera de alcance por decisión (H7).

### Veredicto de la segunda pasada

**Apto.** H1 cumple la regla literal del usuario:
- carga contra el enemigo que está en la recta, en todas las variantes probadas;
- no carga contra el que está al lado, ni tras un giro, ni con una unidad en medio, ni
  con una recta de 2;
- con un enemigo de dos casillas basta una de ellas;
- cada carga es la de su objetivo, aunque haya dos cargables;
- en el agente, lo anunciado y lo cobrado coinciden.

H2, H3 y H6 están corregidos y no han traído nada nuevo. Que la IA casi no cargue es
consecuencia de la geometría de la regla, no un fallo. Los tres menores nuevos (N1-N3)
no impiden cerrar.
