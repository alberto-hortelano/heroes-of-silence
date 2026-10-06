# QA — Los caminos como tramos (#153)

QA de cero, sobre el diff sin commitear (21 ficheros, árbol en `12ba03b`). No he tocado nada del repo; mis guiones, volcados y capturas están en el scratchpad de la sesión. Tampoco he tocado el 3100 (vite del usuario, pid 84173) ni el 3636 (tutor-mcp): mis procesos usaron el 3190 y puertos elegidos por el sistema, y al terminar los maté por grupo y comprobé con `ss` que los puertos quedaban libres.

## Criterios

| # | Criterio (requisitos + decisiones del usuario) | | Evidencia |
|---|---|---|---|
| C1 | Lo pintado y medido en el procedimental son los tramos trazados; 0 ciclos dentro de una región en s1-10 y en el test denso | ✅ | Script propio, independiente de `test/helpers.ts`: μ por región con `estructura().regionDe` y los nodos, sobre los 223 mapas (203 de 34×34 y 20 de 48×48). **0 ciclos dentro en los 223.** En s1-10, los ciclos de dentro pasan de 1,1,0,2,1,4,1,0,1,1 (HEAD) a 0 en todas, y los totales bajan exactamente en esa cantidad (s1 5→4, s6 9→5…). |
| C1′ | Horquillas en L, como el «antes» de `capturas/`: sin cruces en X ni Y nuevas, y sin estrellas de más de 4 ramales que no existieran | ✅ | En los 214 mapas cuyas casillas son las de HEAD, **ningún tramo de hoy falta en lo que pintaba HEAD** (`aristasDeCamino`). Solo se quitan 242 tramos espurios. En los 223: 0 Y no obligadas, 0 X, 0 casillas con más de 4 ramales nuevas, y el grado máximo es igual que en HEAD en s1-10. Comparé a 110 px, renderizado por mí con el taller, contra la mitad izquierda de `capturas/`: s7-3-5, s1-14-12, s7-20-9 y s3-13-14 tienen la misma topología, y en s1-4-6 desaparece el triángulo espurio. Informe del taller de s1/s3/s7 a 48 y 110 px: `spritesSobreSenda` 0 y `errores` []. |
| C1″ | Excepción: solo 4 Y obligadas (60, 64, 177, 986), con esquina en un nodo y la otra esquina barrera | ✅ | Mi barrido de todas las diagonales con esquina de camino en los 223 mapas da exactamente 4: s60 (8,12)-(9,13) con esquina (9,12); s64 (17,16)-(18,17) con esquina (17,17); s177 (24,8)-(23,9) con esquina (23,8); s986 (5,16)-(6,17) con esquina (6,16). Las cuatro tienen la esquina en un nodo y la otra esquina no pisable. No hay ninguna otra, y tampoco en 48×48. A 110 px (taller, s60 y s64), la diagonal queda bajo la puerta o el puente del nodo y no se lee como Y. |
| C2 | Desaparece la fase `caminos` | ✅ | `FASES_DEL_VESTIDO = ['fronteras', 'objetos', 'obstáculos']`. Ya no hay `fallo('caminos', …)` y `trazarCaminos` no devuelve `string`. |
| C3 | El contrato del agente no cambia: `mapPlanSchema.roads`, `serializeKnownMap` y `COMO_SE_LEE_EL_MAPA` siguen en casillas | ✅ (ver H3) | `git diff HEAD -- src/core/contract/agent.ts` sale vacío, y `COMO_SE_LEE_EL_MAPA` no está en el diff. `serializeKnownMap` en HEAD y ahora (s1, s3 y s7, los dos jugadores): **el único campo distinto es `roads`, y como conjunto es igual**; solo cambia el orden (H3). Con la niebla abierta del todo salen 206/211/177 casillas, las mismas que en HEAD. |
| C3′ | Plan del agente: fuera del mapa, suelto, bloque 2×2, repetidos, sobre barrera | ✅ | Probado con `mapPlanSchema.parse` → `validateMapPlan` → `buildMap`:<br>• fuera → «3 casillas de camino se salen del mapa: (-1,0), (34,5), (5,999)», sin lanzar;<br>• suelto → `sueltas=1`, `tiene()=true`, no se pinta;<br>• 2×2 → 4 tramos rectos y ninguna diagonal (la regla de siempre);<br>• repetidos → mismas 211 casillas;<br>• sobre barrera → rechazado con su frase;<br>• `tramos` inyectado → zod lo quita.<br>«Fuera + ciudad duplicada» solo devuelve lo de la ciudad, igual que en HEAD (retorno temprano), así que no es regresión. |
| C3″ | `planDelAgente` no pierde caminos | ✅ | 243 planes (34×34 s1-200+864/986/987, 48×48 s1-20 y 24×24 s1-20), cada uno por `JSON` → `mapPlanSchema.parse` → `validateMapPlan` → `buildMap`: 0 problemas y las mismas casillas que `buildMap(plan)` en todos. |
| C4 | El espectador y el taller pintan los mismos tramos que el cliente | ✅ | En vivo con Playwright sin pantalla, servidor propio (`HEROES_SEED=1` y `=7`, `HEROES_WAIT_AGENT_MS=0`, puertos 0) y `/espectador/?puerto=N` sobre mi vite del 3190: llega a `data-escenario="pintado"` en ~7 s y la consola sale limpia. El mapa de s1 en el espectador tiene las mismas sendas que el render del taller de s1 (cruces del centro nevado, ramal de la aldea). El cliente con `?seed=1` y `?seed=7` llega a `pintado` en 6,4 y 6,9 s, consola limpia, y las horquillas en L/T. La igualdad exacta de la red tras el cable la cubre el test de `espectador.test.ts`. |
| C5 | El coste no cambia; el banco solo cambia en las 7 aprobadas | ✅ | `pnpm banco`: `020ccc584552…`, `ancla: igual`, 0/200 sin terminar. Volcado HEAD (worktree temporal, ya borrado) contra el de ahora: `642241f8…` frente a `020ccc58…`, y cambian **exactamente 43, 60, 64, 70, 87, 167 y 177**, las siete desde el hecho 1 (`raider_spawned`, otro mapa). Las otras 193 salen idénticas línea a línea. Las casillas también son idénticas en todos los mapas, salvo esos 7 y 864/986 del test denso. |
| C6 | `pnpm verify`, `qa`, `banco` y `capturas` | ✅ | `verify`: 54 ficheros, 1805 tests, exit 0. `qa` (puertos 0): exit 0, «1 mapa diseñado, 5 turnos de mapa, 28 decisiones de batalla y 1 ascenso». `banco`: arriba. `capturas`: exit 0, «sin errores en consola», 188,5 s; elige puertos libres solo, así que no chocó con el 3100 ni con el 3636. Además: `barrido-semillas` 0/40 sin terminar, y `vite build` en verde. |

## Hallazgos

### Importantes
Ninguno.

### Menores

**H1 — El espectador presenta como normal un fotograma que no puede pintar.** El cambio abre un sitio nuevo donde se lanza: antes `adaptarEscena` hacía `new Set(roads)`, que no lanzaba nunca. Ahora rehace la red con `RedDeCaminos.desdeTramos`, que lanza. `aplicar` (`espectador/main.ts:322`) asigna `vista` **antes** de que `adaptarEscena` lance y deja `escena` sin actualizar. El `catch` de `dibujar` escribe bien el motivo, pero el siguiente fotograma pinta sin fallar (con `escena` nula no hay nada que pintar), pone `fallandoAlPintar = false` y vuelve a escribir «Mirando la partida en ws://…». Es justo lo que el comentario de `dibujar` dice que no debe pasar.
- **Reproducción.** Un servidor WS falso que manda un snapshot con el formato de antes, `map.roads` con claves `"x,y"` y sin `tramos`. Es lo que manda un `pnpm partida` arrancado antes de actualizar el repo, con un `pnpm mirar` nuevo. Se abre `/espectador/?puerto=N`. A los 10 s:
  - el lienzo está negro (`data-escenario="sin-mapa"`) y los paneles laterales, llenos (oro, crónica);
  - el pie dice «Mirando la partida en ws://localhost:38139.»;
  - el motivo solo sale en consola: `[espectador] fallo al pintar TypeError: Cannot read properties of undefined (reading 'length') at redDelCable`.
- **Otros mensajes malformados.** Pasa lo mismo con un tramo no vecino («el tramo de camino de (0,0) a (24,14) no une dos casillas vecinas distintas»), con uno fuera del mapa y con uno repetido. Captura: `falso-viejo.png` en el scratchpad.
- **Qué esperaba quien mira.** Que el pie dijera que no se puede pintar y por qué. En el caso del formato viejo, algo legible del estilo «el servidor habla otra versión del cable», no un `TypeError`.
- **Alcance.** Solo se llega por desfase de versiones o por un bug del emisor; con servidor y cliente del mismo árbol no pasa.

**H2 — `RedDeCaminos.desdeTramos` acepta coordenadas `NaN`, y también no enteras.** `dentroDelMapa` y la comprobación de vecindad comparan con `<`, `>` y `> 1`, y con `NaN` todas dan falso. Un cable con `tramos` de longitud impar (quité el último índice) produce un tramo con un extremo `{x: NaN, y: NaN}`, y nada lo rechaza.
- El espectador llega a `pintado` con la consola limpia: el fallo pasa en silencio.
- La doc de la clase dice que «lanza si una casilla cae fuera del mapa».
- El agente no puede llegar ahí, porque `pointSchema` es `int`. Solo se llega por el cable o por un bug del núcleo.

**H3 — `serializeKnownMap.roads` cambia de orden.** Es el mismo conjunto de casillas, pero antes salían en el orden del trazado y ahora en el de los tramos canónicos (s1, jugador 0: antes `(6,4) (5,5) (0,6) (2,6)…`, ahora `(6,4) (5,5) (5,6) (0,6)…`). No rompe el contrato, porque `roads` se lee como conjunto y el banco no se mueve. Pero `implementacion.md` dice que sale «con la misma salida», y byte a byte no es así: el hash del JSON cambia en s1, s2, s3, s7 y s10.

**H4 — El guardia `horquillasNuevas` solo mira los mapas de 34×34**: lo envuelve `if (lado === LADO_DEL_MAPA)`, así que los 20 de 48×48 del test denso quedan fuera. Hoy no esconde nada, porque mi barrido da 0 Y y 0 X también en 48×48, pero es un hueco de cobertura.

### Observación ajena al cambio
`pnpm capturas` captura `espectador-01-mapa.png` 800 ms después del primer turno, antes de que el suelo esté pintado, y en esa captura no se ven sendas. Lo pinta el sucedáneo de pigmentos y el código es de antes de este ciclo. Mirado en vivo, esperando a `pintado`, el espectador sí pinta los caminos. Además, `capturas` escribe por defecto en `docs/agents/2026-10-01-cliente-nuevo/capturas/`, que no está en seguimiento.

## Workarounds usados
- **Servidor sin agente** (`HEROES_WAIT_AGENT_MS=0`, `HEROES_SEED=1/7`) para ver en el espectador las semillas 1 y 7. Es una forma documentada de arrancar `pnpm partida` y el espectador recorre su flujo real. La partida termina en segundos, así que miré el fotograma final. No afecta a quien juega.
- **El zoom del espectador no responde a la rueda** en mis pruebas: el encuadre es fijo y abarca el mapa. Lo comparé a la escala que da, no a 110 px. Las comparaciones a 110 px las hice con el taller (`componer` es el mismo) y con el cliente a zoom máximo.
- **Servidor WS falso** para los mensajes malformados y viejos (H1, H2). Es un escenario fabricado a propósito para la pasada adversarial, no la receta de un criterio.
- **Recortes a 110 px.** Mis recortes del taller no tienen el mismo encuadre que `capturas/`, que se hicieron con el cliente y con niebla. Comparé la topología de las bifurcaciones, no los píxeles.

## No probado
- Que el espectador y el cliente pinten **los mismos píxeles** en vivo: sus cámaras son distintas y el cliente tapa casi todo con la niebla. Lo cubren el test de la inversa y mi comparación visual con el taller.
- La partida con un agente Claude real por MCP: `pnpm qa` hace ese circuito con la política de QA.
- El cobro del paso diagonal junto a un nodo en `Busqueda.buscar`: no cambia ningún camino en los 223 mapas, así que no tiene efecto que observar.

## Veredicto
**Apto con reservas.** Se cumplen todos los criterios: 0 ciclos dentro de cada región, horquillas en L con solo las 4 Y obligadas, contrato del agente intacto salvo el orden de `roads`, banco con exactamente las 7 semillas aprobadas, y capturas y espectador limpios. Las reservas son menores y quedan fuera del flujo normal: el espectador se calla un fallo de adaptación (H1), `desdeTramos` deja pasar `NaN` (H2), el orden de `roads` cambia (H3) y el guardia no mira los mapas de 48×48 (H4).
