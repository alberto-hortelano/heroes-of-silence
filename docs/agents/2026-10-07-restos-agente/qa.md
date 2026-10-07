# QA — #158 (a-d), #121, #122 (restos del agente)

Worktree `/home/al/code/heroes-pequenos`, rama `agente-restos`, sin commitear. Criterios: los de «Tras la crítica (VIGENTE)» de `requisitos.md`, más los 2, 3 y 6 originales. QA del 07-10-2026.

Guiones de QA (fuera de lint y typecheck, como el `navegador.ts` del ingeniero), en esta carpeta:
- `qa-navegador.ts`: Chromium sin pantalla contra un vite propio.
- `agente-qa.ts`: servidor, WebSocket y puente MCP de verdad.
- `corte-sobre-algo.ts`: una marcha cortada que acaba encima de un objeto.
- `nombres.mjs`: 45 nombres contra la regla, en Node 24 y en Node 26.

Capturas en `capturas-qa/` (las de `pnpm capturas`, en `capturas-qa/capturas/`).

## Criterios

| # | Criterio | | Evidencia |
|---|---|---|---|
| 1a | Rechaza los invisibles entre letras: U+200B, U+2060, U+00AD, ZWJ entre letras y etiquetas fuera de una bandera | ✅ | `nombres.mjs` rechaza los 21 casos malos. Están los cinco de la crítica y además BOM, CGJ U+034F, U+180E, relleno hangul U+3164 y U+115F, VS16 tras una letra, VS U+E0100, ZWNJ, U+FFF9, U+2061 y U+1D173, ZWJ suelto al final y antes de una letra, etiquetas al final, bandera sin cancelar y cancelar suelto. Mensaje: «el nombre de un héroe no puede llevar caracteres invisibles: solo los que unen un emoji». |
| 1a | Rechazo de punta a punta | ✅ | `agente-qa.ts invisible`: el plan de mapa lleva el pueblo `"Ana​Bo"`. El veredicto de req-1 dice «Tu respuesta a "map_generate" no encaja… El mapa lo pone el generador procedimental y la partida empieza igual. — plan.towns.0.name: el nombre de una ciudad no puede llevar caracteres invisibles…». |
| 1b | Acepta 🏴󠁧󠁢󠁳󠁣󠁴󠁿, ❤️ y 👨‍👩‍👧 | ✅ | `nombres.mjs` acepta 24 de 24. Además de los tres pedidos: Escocia dentro de una frase, 👩🏽‍💻, 🧑‍🦰, 🏳️‍🌈, 🏳️‍⚧️, ❤️‍🔥, 🐻‍❄️, 💏 con tonos, 🧑🏻‍🤝‍🧑🏿, 1️⃣, #️⃣, 🇪🇸, 👁️‍🗨️, U+1FAEA (Unicode 17), U+1FAE8, y textos en cirílico, árabe, hindi, tailandés y coreano. De punta a punta, `agente-qa.ts emoji` manda el pueblo «Villa 🏴󠁧󠁢󠁳󠁣󠁴󠁿 ❤️ 👨‍👩‍👧» y el veredicto dice «✓ req-1: Tu plan de mapa entró». |
| 1c | El mismo test en Node 24 y en Node 26 | ✅ | `~/.nvm/versions/node/v24.11.1/bin/node` (Unicode 16): `agent-contract.test.ts` da 62/62 y `nombres.mjs` 45/45 ok. Node v26.10.0 (Unicode 17): 45/45 ok. La dependencia que queda (marcas y `Cf` asignados después de la tabla del Node) está acotada y dicha en el comentario de `lineaLegible`. |
| 2 (c) | Con la partida terminada, la barra mantiene el desenlace al pasar el puntero | ✅ (derrota) / ⚠️ (victoria) | `qa-navegador.ts c` con las semillas 10 y 14: «Fin de turno» hasta «Partida perdida». La barra dice «Derrota: has perdido tu base.» y sigue igual tras mover el puntero por 6 puntos del lienzo, en las dos semillas (`c-10-1-puntero.png`, `c-14-1-puntero.png`). La victoria no se ha probado en el navegador (ver «No probado»). |
| 3 (d) | «Continuar» durante la última animación espera y vuelve sin segundo clic | ✅ | `qa-navegador.ts d`, con la batalla jugada a Espacios y «Continuar» pulsado en cuanto aparece. En ningún caso sale el aviso de espera, el turno no cambia y no hay nada en consola. **Un clic:** semilla 14, vuelve al mapa a los 6290 ms; semilla 43, a los 3109 ms. **Tres clics seguidos:** semilla 50, a los 2103 ms y una sola vuelta. **Con teclado** (foco en el botón y Espacio): semilla 58, a los 3329 ms. **Con la cola ya vacía:** semilla 97, vuelve en el acto. Capturas `d-*-1-continuar.png` y `d-*-2-mapa.png`. |
| 4 | Un `move_hero` que da algún paso y no llega cuenta como aplicado, y el veredicto dice «parcialmente», dónde quedó y cuántos pasos faltan | ✅ | `agente-qa.ts emoji`, por el MCP real, cada día un `move_hero` hacia (10,5). Día 1: «Turno del día 1: 1 de 2 acciones aplicadas, 1 descartada… Una marcha entró parcialmente, sin llegar: move_hero hero-1 → (10,5): entró parcialmente; se quedó en (11,29) y le faltan 27 pasos». `game_state` lo confirma: héroe en `{"x":11,"y":29}`. Días 2, 3 y 5: (9,18) con 15 pasos, (13,7) con 4 pasos y (8,17) con 14 pasos. |
| 4 | Uno que no da ni un paso sigue descartado | ✅ | El segundo `move_hero` idéntico del mismo día se descarta todos los días: «move_hero hero-1 → (10,5): no quedan puntos de movimiento para dar ni un paso». `test/ascenso.test.ts` no tiene cambios y está en verde (dentro de `pnpm verify`). |
| 4 | Test del contrato y sin tercera copia del recorte | ✅ | `agent-link.test.ts` (#121) y `notas.test.ts`. El recorte vive en `pasosDeHoy` (`game.ts`). `session.ts` ya no tiene su `filter` y `stepTowards` no se ha tocado. |
| 4 | La marcha cortada acaba encima de algo | ✅ | `corte-sobre-algo.ts`, sin asaltantes ni monstruos y con los puntos justos para pisar el objeto. En cada caso la crónica escribe primero el hecho del objeto y luego el corte, y el héroe se queda en esa casilla. Nodo (semilla 1, (9,14)): `…node_captured, march_cut(faltan=28)`. Pueblo (semilla 1, (18,18)): `…node_captured, …, march_cut(faltan=17)`. Mina (semilla 1, (21,19)): `march_cut(faltan=14)`. Recurso (semilla 2, (13,23)): `resource_gained, march_cut(faltan=13)`. Cofre (semilla 4, (14,13)): `resource_gained, march_cut(faltan=21)`. Con monstruos o asaltantes, la batalla para la marcha y no se escribe `march_cut`. Es lo que pide el plan. |
| 4 (cliente) | Quien juega no nota el cambio de `moveHeroTo` | ✅ | `qa-navegador.ts m`, semillas 11 y 39. Un clic lejano anda lo de hoy y deja la barra vacía: el héroe se queda con 35/1100 de movimiento. El segundo clic dice «No quedan puntos de movimiento para dar ni un paso.» (`m-11-*.png`). La ruta dorada y gris sigue igual: `desktop-02` dice «hoy llegas a 10 de 11 pasos». |
| 5 | La prosa de `map_generate` dice la verdad, sin reintento | ✅ | La petición real que llega por el MCP termina en «Si el plan no vale, se juega el mapa del generador procedimental y te llega la lista de problemas como aviso: no se te vuelve a pedir.». Con el plan rechazado no llega un segundo `map_generate`: la siguiente petición es `adventure_turn` (req-2). |
| 6 | `pnpm verify` | ✅ | `Test Files 56 passed (56) · Tests 1931 passed (1931)`, exit=0. `pnpm lint`: «Checked 221 files… No fixes applied». |
| 6 | `pnpm qa` | ✅ | exit 0: «35 veredictos, 35 entraron, 0 descartadas», «terminado por fin de partida: 1 mapa diseñado, 5 turnos de mapa, 28 decisiones de batalla y 1 ascenso». |
| 6 | `pnpm banco` igual | ✅ | `sha256: 020ccc584552b1bae38d02cbc57879a488d5c39c08b20b51ab28eafc1ab27e36`, «ancla: igual», 0/200 sin terminar. |
| 6 | Barrido de semillas | ✅ | `sin terminar: 0/40 → []`, duración 7 / 15 / 27. |
| — | `pnpm capturas` al cerrar | ✅ | exit 0, «sin errores en consola; … 235.0 s». PNG en `capturas-qa/capturas/`. `desktop-12-fin-de-partida.png` enseña «Derrota: has perdido tu base.» en la barra. |

## Hallazgos

Ninguno bloqueante.

### Importante

**I-1. «Continuar» no responde a la vista durante varios segundos (UX, fuera del criterio literal).** El criterio se cumple: no hay aviso y no hace falta un segundo clic. Pero durante la espera no cambia nada en pantalla y el botón sigue igual. Con la semilla 14 son 6,3 s: la captura `d-uno-14-1b-un-segundo-despues.png`, un segundo después del clic, es indistinguible de la de antes. Quien juega pensará que el clic se ha perdido y volverá a pulsar. Ahora eso no hace daño (tres clics dan una sola vuelta).
- Para reproducirlo: `?seed=14`, clic en la guardia a la vista y Espacio hasta que salga «Continuar». Pulsarlo en cuanto aparece.
- Lo que se esperaba: que algo diga que el clic se ha recibido (el botón desactivado o «Volviendo…»), o que la cola se acelere.
- Sugerencia: va con A4 de `hallazgos-simplify.md` (aplazar gestos con la cola ocupada), que ya es una issue aparte.

### Menor

**M-1. Huecos de la regla de invisibles que no recoge el comentario de `lineaLegible`.** Se aceptan, y se ven igual que otro nombre:
- `"Bo1️"` (un VS16 tras un dígito, sin el U+20E3 de la tecla) se ve «Bo1»;
- `"Bo1️‍🐉"` se ve «Bo1🐉»;
- `"Bo🏴" + etiquetas inventadas («ab») + U+E007F` se ve «Bo🏴».

`SELECTOR_TRAS_PICTOGRAFICO` admite `0-9#*` sin exigir el U+20E3 que cierra la tecla, y `BANDERA_DE_ETIQUETAS` admite cualquier etiqueta y no solo una subdivisión. El comentario solo dice que se cuela 🐉‍🐉. Es poco probable que el agente lo escriba, pero hay que acotarlo o dejarlo dicho en el comentario.

**M-2. Con la partida terminada, un clic en el mapa sigue tapando el desenlace, y con una frase sin mayúscula.** Tras «Derrota: has perdido tu base.», un clic en el lienzo deja la barra en «la partida ya ha terminado», en minúscula y sin punto. Pasa con las semillas 10 y 14 (`c-10-2-tras-clic.png`). Está fuera de alcance (#162, plan §6), pero el «sin mayúscula» contradice el `comoFrase` que esta misma tarea generaliza en `session.ts`.

**M-3. El veredicto repite «entró parcialmente».** La frase queda «Una marcha entró parcialmente, sin llegar: move_hero … : entró parcialmente; se quedó en…». Es correcto y se entiende, pero es redundante.

**M-4. Una emboscada en el último paso del día sale como «aplicado entero» aunque el héroe no llegue.** Está documentado en `implementacion.md` y se resolverá al fusionar con #130 (`march_halted`). Lo anoto para que no se pierda.

## Workarounds usados

- **`corte-sobre-algo.ts` quita asaltantes y monstruos, y fija `movePoints` a mano.** Sin eso, con las semillas 1 y 2 la marcha la para antes una batalla, que es lo correcto. Solo sirve para que el último paso pagable caiga sobre el objeto. A quien juega no le afecta: es una receta para reproducir un caso que el juego da solo cuando coinciden los puntos.
- **`qa-navegador.ts m` elige un destino que el espejo (`Session` en Node) anda sin batalla.** Con las semillas 1 y 7 el primer destino lejano acababa en emboscada, también con la ruta sin aviso de peligro. Lo veo coherente: la emboscada no se avisa si el grupo no se ve. Es el comportamiento previo a la tarea, no un hallazgo de ella.
- **La batalla de (d) se juega a Espacios, no con «Resolver sola».** «Resolver sola» vuelve al mapa sin pasar por «Continuar». Es como lo hizo el ingeniero y es un flujo real de quien juega.
- **Los puertos.** Vite propio en el 3193 (`--strictPort`), lanzado con `set -m` en su línea, comprobado por `readlink /proc/<pid>/cwd` y muerto por su grupo. Después, «3193 libre», y ningún puerto en escucha con cwd en el worktree. `pnpm capturas`, `pnpm qa` y `agente-qa.ts` levantan y paran sus propios servidores en puertos que elige el sistema. No he tocado ningún proceso ajeno.

## No probado

- **(c) con victoria en el navegador.** Hace falta tomar la base rival con clics, y la cámara y la guarnición lo hacen caro de guionizar. Lo cubre `escenas.test.ts` por el camino real (`moveHeroTo` → `alAcabarseElMapa` → «¡Victoria!»), con la misma guarda `desenlace !== null`.
- **(d) con una batalla ganada y al cambiar de batalla, en el navegador.** Las cinco batallas jugadas a Espacios se perdieron. La acción pendiente es la misma (`finishBattle`) gane quien gane. El cambio de batalla lo cubre `escenas.test.ts` («se olvida»).
- **(d) en el espectador.** No tiene «Continuar», así que no aplica.
- **`pnpm qa` con una marcha parcial.** Su política no la manda. La he cubierto con `agente-qa.ts`, por el mismo circuito (servidor, WS y MCP).

## Veredicto

**Apto con reservas.** Se cumplen los seis criterios con evidencia del flujo real: el canal MCP para #121, #122 y (a), y Chromium para (c) y (d). verify, qa, banco con el mismo hash, barrido y capturas están en verde, y no hay errores de consola. Las reservas:
- I-1, «Continuar» sin respuesta visible varios segundos: la mecánica es correcta y la experiencia todavía no;
- M-1, los huecos de la regla sin decir;
- la victoria de (c), no probada en el navegador.

Nada de eso obliga a otra vuelta del ingeniero antes de fusionar. I-1 y M-1 pueden ir a una issue o a una línea del comentario.
