# Crítica — la crónica pasa por la niebla (#59)

**REENCUADRADA.** El agujero es real y **mayor** que el enunciado; los criterios 1–6 están bien. Mal encuadrados: el
**7** —el dato que falta no es `from` en dos eventos, es **quién y dónde en casi todos**— y el **10**, que debería
salir de esta tarea.

## El problema real, en una frase

El `GameEvent` es **anónimo** —no dice de quién ni dónde— y por eso el log solo se puede mandar entero.

## La premisa, verificada

Medido con 40 semillas × ≤60 días, IA contra IA, jugador 0 como agente, sellando `state.log.push` desde fuera (guiones
en el scratchpad: `fuga2.mts`, `batallas.mts`, `coste.mts`, `qa2.mts`; nada de producción tocado).

- **`recentEvents: state.log.slice(-25)` va sin filtrar**: cierto, `serialize.ts:162`. Y **«sigue leyendo su diario»**
  es cierto y **mayor de lo que dice el issue**: 2767 de 6287 eventos entregados son del rival = **44,0 %**, o **9,6
  de cada 25 por lectura**.
- **Los cinco tipos que cita**: los cinco (`hero_moved`=1771, `built`=249, `recruited`=99, `mine_captured`=71,
  `resource_gained`=31), más seis que no cita: `turn_start`=286, `battle_started`=118, `hero_hired`=76,
  `garrison_taken`=53, `spells_learned`=7, `town_captured`=6.
- **Las capturas no llevan de quién era**: cierto (`game.ts:110-111`); `map.ts:22,32` ya tipan `owner: number | null`,
  así que `from` encaja. **`renderLog` es presentación**: cierto, `panels.ts:395`.
- **«Ver mapa entero» es depuración**: a medias — el botón vive en la interfaz normal (`panels.ts:82`).

Lo que el enunciado no vio (`src/core/state/game.ts:105-120`):
- **683 de 6287 eventos entregados (10,9 %) no se pueden atribuir hoy a nadie**: `hero_moved`=579,
  `battle_started`=87, `garrison_taken`=14, `spells_learned`=3. Motivo: `state.heroes = state.heroes.filter(...)`
  (`game.ts:908` y `:941`) borra al héroe **antes** de escribir `hero_defeated`; su dueño ya no existe.
- **317 eventos del rival no tienen sitio derivable** —`turn_start` (286) y `resource_gained` (31), cuyo objeto ya
  está `taken`—: el criterio 5 dice «solo si observas el sitio» sobre eventos que no tienen sitio. Y `battle_ended` y
  `hero_defeated` no llevan ni jugador ni sitio: **187 eventos de batalla en los que no participo llegan al agente,
  171 de ellos `hero_defeated` del rival**.

**Conclusión: el criterio 1 no es implementable sobre el `GameEvent` de hoy.**

## El criterio 6, mirado antes de que nadie lo diseñe

Temías complejidad pura. **Es al revés: es el único camino que existe, y sale gratis.**
1. **Recalcular al leer no es más barato: es imposible** para ese 10,9 %, y **mal** para otros 133 eventos
   (`hero_moved`=103, `built`=23…) que **no vi al ocurrir y hoy sí veo su casilla**: filtra al revés y mete fuga
   nueva.
2. **El recuerdo NO caduca antes que la ventana.** La ventana de 25 abarca **2,34 días**, y en ese lapso **230**
   eventos del rival pasaron de visibles a no visibles (`hero_moved`=160, `battle_started`=63…). 230 + 133 = **14,8 %
   de los eventos del rival con sitio cambian de veredicto** según cuándo se evalúen. No es caso de esquina.
3. **Sellar al ocurrir cuesta cero.** Una partida entera genera **141 eventos**; dos `visibleNow` por evento, 20
   partidas, tres pasadas: −2 %, −4 %, −2 % — dentro del ruido.

**¿Tercera vía? Sí, y no es `Player.memory`.** Lo que falta no es una estructura nueva por jugador: es **el evento
dejando de ser anónimo** —protagonista y sitio escritos por quien lo emite, como el criterio 8 ya pide para `from`—.
Con eso «quién lo presenció» es consecuencia, no decisión aparte: la pregunta abierta «¿dónde vive *me consta*?» está
mal planteada mientras el evento no diga de quién es.

## El criterio 10, con sus agujeros

**Recomiendo sacarlo.** No por lo que dice: por dónde cae.
- **El mapa del cliente nunca pasó por #35.** `adventure.ts:127-129` pinta con `player.fog` —«lo exploré alguna vez»—,
  no con `visibleNow`: dibuja al héroe enemigo en su **posición viva** y el dueño **actual** de minas y castillos en
  cualquier casilla pisada alguna vez. Filtrar solo la crónica deja a la persona **viendo al rival en el lienzo y sin
  una línea que lo cuente**: incoherencia nueva, y tapa la más pequeña de las dos fugas del cliente.
- **Hoy la crónica del cliente no enseña de más: MIENTE.** `renderLog` pinta `built`, `recruited` y `garrison_taken`
  sin dueño —lo del rival parece tuyo—, `spells_learned` **siempre** en clase `win` y `hero_defeated` **siempre** en
  `lose`: cuando muere un héroe enemigo se le pinta a la persona como derrota propia. Eso es #18, y lo arregla el
  **mismo dato**, no el filtro.
- Ninguna pantalla depende del log completo (`panels.ts:134`, y el espectador de `ws-server.ts:97` no tiene lectores).
  Si se mantiene, hay que escribir que *«la crónica será más estricta que el mapa»* y abrir el issue del mapa del
  cliente — lo que el propio documento manda en «Fuera de alcance».

## Conflictos

- **#18 — solapamiento fuerte.** Ambas necesitan quién protagoniza cada evento: el criterio 9 lo pide para dos, #18
  para todos. Separadas se paga dos veces la misma migración del tipo. **Conviene fusionar la mitad del log.**
- **#30 / #32 — sin conflicto hoy.** `ws-server.ts:97` manda `state.log.slice(-40)` sin filtrar y nadie lo lee; deja
  escrito de qué lado cae el espectador. **#34 — dependencia blanda**: si el navegador deja de jugar en local, la
  crónica del cliente vendrá del servidor y el criterio 10 se rehace.
- **#10 — trampa conocida.** Sellar testigos añade otra colección por evento a lo que #10 ya avisa que
  `JSON.stringify` no salva: que no sea un `Set`. **#60 — no bloquea**: las dos primeras lecturas —lo que cubre `pnpm
  qa` hoy— ya traen **5,5 eventos del rival de 13,3**; el criterio 16 sigue siendo el que prueba de verdad.
- **Tarea paralela de rendimiento**: sellar añade ~282 llamadas a `visibleNow` → `visibleFrom` (`map.ts`) por partida
  — dentro del ruido, pero es un llamante nuevo del fichero que optimizan.

## Coste contra valor

El lado del agente **vale lo que cuesta**: es el 44 % de su crónica y sin él #35 no sirve de nada. El criterio 10 es
el trozo caro y menos rentable hoy: arregla la fuga pequeña del cliente dejando la grande, y se lo lleva #34.

## Qué le cambiaría a `requisitos.md` (para pegar tal cual)

1. **Sustituir el criterio 7**: *«Todo `GameEvent` ocultable lleva dentro quién lo protagoniza y dónde ocurre,
   escritos por quien lo emite. Sin eso el criterio 1 no es implementable: 683 de 6287 eventos entregados (10,9 %) no
   se pueden atribuir a nadie desde el estado de hoy. El `from` de las dos capturas es un caso particular, no la
   regla.»*
2. **Añadir al criterio 5** `battle_started`, `battle_ended` y `hero_defeated` del rival —187 llegan hoy sin que
   participe— y **decidir `turn_start`**, que no está en ninguna lista y son 286 del rival.
3. **Reescribir la pregunta abierta de «¿dónde vive *me consta*?»**: *«Resuelto: se sella al ocurrir. Recalcular al
   leer no es la opción barata: es imposible para el 10,9 % y produce 133 fugas nuevas por 40 semillas.»* Y **bajar el
   criterio 3**: la renta diaria de `startTurn` no emite evento, así que «sus ingresos» promete de más.
4. **Mover los criterios 10–12 a #18**; si se mantienen, añadir *«la crónica quedará más estricta que el mapa:
   `adventure.ts:127-129` sigue pintando con `fog`»* y anotar que `renderLog` misatribuye `built`, `recruited`,
   `garrison_taken`, `spells_learned` (siempre `win`) y `hero_defeated` (siempre `lose`).
