# Crítica · tanda 3 «Que la partida dé de sí»

**#62 VIGENTE · #23 REENCUADRADA · #90 REENCUADRADA · #60 PREMATURA.**
Todo lo de abajo lo he medido yo sobre `405559c`, en worktrees ya retirados.

## El problema real, en una frase

En 24×24 los dos jugadores se rematan antes de poder construir nada caro, y el
motor no sabe decir «se acabó» de otra forma que «solo queda uno» — pero **la
gracia de #23 no ataca ni lo primero ni lo segundo: retrasa el anuncio**.

## La premisa, afirmación por afirmación

1. **«La derrota no tiene los 7 días de gracia del original» — FALSO, y la cifra
   7 sí se verifica.** `Kingdom::isLoss()` es `castles.empty() && heroes.empty()`
   (`kingdom.h:98-101`) y elimina **en el acto** (`RemoveCastle`/`RemoveHero` →
   `LossPostActions()`, sin contar un día); `checkDefeat` (`game.ts:499-511`) lo
   reproduce **exactamente**. Los 7 días —`GetGameOverLostDays()` → `return 7;`,
   `game_static.cpp:130-133`— son de **otro** estado: `ActionNewDay`
   (`kingdom.cpp:206-213`) los descuenta solo si `castles.empty()`, sin héroes.
2. **La divergencia va al REVÉS de lo que dice #23**: aquí un jugador con héroes
   y sin pueblos es **inmortal** (el `&&` de `checkDefeat`); allí tiene 7 días.
   Copiar el original **acorta** partidas, no las alarga.
3. **La gracia de #23 es inalcanzable.** `hireHero` (`game.ts:699`) exige
   `town.owner === player.id`, y `captureTown` solo se llama desde `game.ts:928`
   y `:1293`, las dos con un héroe: sin pueblos ni héroes **no hay vuelta**.
4. **Y el reloj bueno tampoco movería nada hoy.** El perdedor pasa por «0 pueblos
   y ≥1 héroe» en **15 de 200** partidas, **mediana 1 día, máx. 5** — por debajo
   de 7: cero partidas cambiarían.
5. **«Faltan días» (#90) — media verdad.** Prototipé la gracia y corrí el banco:
   mediana **7→14**, p90 8→15, máx 20→27; `dwelling_5` **15→150 de 200**,
   `dwelling_6` 2→4, nivel ≥5 en el ejército 7→15… y **dragón óseo 0/200 → 0/200**.
6. **Lo que sí lo trae es el mapa.** 48×48 hoy, **sin** gracia, 200 semillas:
   mediana 30 días, `dwelling_5` 200/200, `dwelling_6` 150/200, **dragón óseo
   123/200** y las **7 de 7** criaturas de nivel ≥5.
7. **La base de #90 está caducada y `CLAUDE.md` la repite.** Sobre el volcado del
   propio `pnpm banco`: hoy `dwelling_5` sale en **15 de 200** y `dwelling_6` en
   **2**; en `2db037e` —fin del ciclo de economía— eran **52** y **10** (entre
   medias, #87 y #88 dieron la vuelta al ganador: j0 184/200 → 42/200).
8. **«Con la gracia el arnés llega a sus seis turnos» (#60) — llega, y es peor.**
   Corrido: imprime `6 turnos de mapa y 15 decisiones de batalla`. Pero el
   servidor dice `día 5 · jugador 1 · agente · **0 acciones**`, y lo mismo el 6 y
   el 7: sin pueblo ni héroe. **Verde cubriendo exactamente lo mismo que hoy.**
9. **Sembrar choca con la misma decisión**: un plan de 48×48 lo rechaza el propio
   servidor («el mapa mide 48×48 y se te pidió 24×24»: `ANCHO_DEL_MAPA = 24`,
   `ws-server.ts:42`), y en 24×24 los inicios ya están en esquinas opuestas.
10. **#62 — VERIFICADO, el único cuya premisa aguanta entera.** El servidor
    anuncia el canal a los **311 / 326 / 359 ms**; con sondeo de 250 ms la espera
    es 500 ms: **~170 ms tirados**. E2E, tres pasadas: **5,46 / 5,47 / 5,45 s**
    contra **5,43 / 5,27 / 5,26 s** sondeando cada 5 ms.
11. Confirmados los puntos 3-5 de `requisitos.md`; las citas del **issue** #23 no.

## El día después

- **La gracia da a toda partida una cola muerta de 7 días** con el ganador
  paseándose solo: banco 1 650 → **2 882 ms**, volcado 32 177 → **56 618 líneas**,
  y **el ganador no cambia en ninguna de las 200** (42/158 antes y después).
  Coste: **4 de 402 tests rojos**, dos de ellos anclas byte a byte. Barrido 0/40.
- **Subir el mapa a 48×48** lleva `pnpm banco` de **1,65 s a 19,9 s** (está en CI
  y en la tabla de tiempos) y da la vuelta al equilibrio otra vez —j0 gana
  **181/200** contra **42/200** en 24×24—, dejando a #89 apuntando al otro lado.

## Conflictos

- **#23 contra `CLAUDE.md`**: «una cita falsa a la fuente es peor que una cifra
  declaradamente inventada». La gracia sobre «0 pueblos **y** 0 héroes» se vende
  como fidelidad y el original hace lo contrario: la mentira de la tabla de
  experiencia otra vez, escrita esta vez en el código.
- **#90 y #60 no dependen de #23**: esperan a la **misma** decisión de mapa, que
  es del usuario. Y **#90 choca con #5**: con la gracia `dwelling_5` se construye
  en 150/200 y solo **15/200** sacan una criatura de nivel ≥5 de la guarnición.

## Coste contra valor

- **#62**: horas, riesgo nulo, ~170 ms por pasada de CI. **Hacerlo.**
- **#23, el tope de días**: tres declaraciones a una, `state.finished` deja de
  mentir y mueren `partidaTerminada` y el `winner: number | null`. Ninguna de las
  200 llega al tope: **no cambia el juego**, es limpieza de contrato. **Hacerlo.**
- **#23, la gracia**: dos anclas rotas y +76 % de crónica por una regla que el
  original no tiene, nadie puede aprovechar y no mueve un ganador. **No hacerla.**
- **#90** se cierra con esta medida y nada más hasta que el usuario decida el
  mapa; **#60** se aparca detrás: cerrarlo con la gracia es comprar la cifra.

## Qué le cambiaría a `requisitos.md`

> **La tanda se reduce a #62 y a la mitad de #23 que no es la gracia.**
> **#23 · criterio 1** se sustituye: la gracia **no** cubre «sin héroes y sin
> pueblos» —fheroes2 elimina en el acto ahí— y de ese estado no se puede volver,
> así que se escribe en el issue con la cita y **no se implementa**; lo que sí
> falta del original es el reloj sobre «sin castillos, con héroes», hoy infinito,
> y se hace o no sabiendo que no mueve ninguna de las 200 partidas. **Criterios 2
> y 3 caen con él. Criterios 4 y 5** se quedan y son el trabajo de la tanda,
> renombrados: no es «victoria por tiempo» sino que `state.finished` sepa decir
> «se agotaron los días y no ganó nadie», que `protocol.ts:96` ya parchea. **#90**
> se cierra con esta medida —**no faltan días, falta mapa**: 24×24 con 7 días más
> da dragón óseo 0/200; 48×48 sin tocar nada, 123/200— y se lleva al usuario con
> el precio delante. **#60** se aparca detrás de esa decisión: medido, la gracia
> le da 6 turnos de los cuales 3 con 0 acciones. Y se corrige la base de
> `CLAUDE.md`: `dwelling_5` es **15 de 200** hoy y no 52, `dwelling_6` **2**, y la
> mediana **7 días**, no 6.
