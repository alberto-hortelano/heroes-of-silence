# Requisitos — panel-durante-la-jugada

Tarea: `2026-11-11-panel-durante-la-jugada`. Issues: 257. Rama de coordinación `claude/parallel-issue-closure-f85bd0` (sobre `main` `d791d03c`, con la tanda 1 fusionada: #327, #332 punto 2, #305, #313+#317, #321; #202 en QA).

## Petición literal

> «Ve cerrando issues. Intenta hacer los que se puedan en paralelo, tu dedicate a coordinar el trabajo y usa agentes para hacer los issues»

El coordinador eligió esta tarea entre los issues abiertos (tanda 2). Lo que pide cada issue, tal cual:

### #257 — Batalla: el panel de la partida (En el campo, parte, recarga) enseña el final mientras se anima la jugada

> Visto en la rueda del golpe (docs/agents/2026-10-13-rueda-del-golpe/, vuelta 2 de QA).
> 
> El animador ya retiene la vida y quién actúa hasta cada impacto (`EstadoFigura.pv`, `BattleAnimator.activo`), en la partida, la arena y el espectador. Pero otras cosas siguen leyendo el estado, que ya trae el final de lo que se cuenta:
> 
> - los tiros que quedan, el `↑N` del tablero (`src/client/render/batalla.ts`, `tirosQueQuedan`): en una pelea larga de la IA, un tirador enseña desde el principio los que le quedarán al final;
> - el panel «En el campo» y `enemigosFuera`.
> 
> Qué haría falta: que el animador retenga también los tiros (con lo que dice el registro: cada `shoot`), y decidir qué hace el panel mientras se cuenta (hoy dice «Contando la jugada…» en la arena). Solo afecta a la partida y al espectador: en la arena ya no hay munición.

## Criterios de aceptación

Los del issue, tal cual, salvo lo que la crítica reencuadre. Cada regla nueva, con su test visto morder; lo que se ve, comprobado en el navegador con Playwright sin pantalla.

## Fuera de alcance

Medidas de jugabilidad (CLAUDE.md, «No se prueba la jugabilidad»). `pnpm capturas` lo pasa el coordinador al final de la tanda.

## Tras la crítica (11-11-2026)

El crítico la dio por **reencuadrada** (`critica.md`). El coordinador acepta su alcance, que sustituye a los criterios de arriba:


El `↑N` de tiros ya no existe (sin munición desde el 13-10): no se retienen tiros. Lo que queda es la **partida**.

1. **El final no se adelanta.** Mientras el tablero de la partida cuenta (`batalla.ocupada`), el lateral no enseña «Victoria»/«Derrota» ni el parte del final, y la línea de estado no dice «La batalla ha terminado.»; salen cuando el tablero cuenta el último golpe. Test que muerde: una batalla que acaba por una jugada (de la IA o de la persona), panel con `contandoAun` sin el final; con `contandoAun` falso, con él.
2. **Nada de después de lo contado en el lateral.** Mientras cuenta, «En el campo» no quita a quien aún no se ha visto caer ni enseña recarga, granadas o efectos que trae una jugada aún no contada; el parte no trae líneas de jugadas no contadas; la ronda no salta antes de tiempo. Si se calla en vez de retener (como la arena), se calla entero y se dice qué se enseña en su lugar. La elección, con su porqué y fecha, en `docs/areas/batalla.md`.
3. **El aviso «Enemigo (N)» del móvil** (`enemigosFuera`) no descuenta a un enemigo antes de verlo caer ni se vacía en cuanto el estado trae el final.
4. **Una sola regla para el «mientras cuenta»** en `panelDeBatalla` (partida y arena); la arena puede seguir callando, pero no por una copia aparte si la regla común la cubre. Si cambia `test/fixtures/paneles.txt`, se re-ancla diciendo qué cambió.
5. **El espectador queda fuera** (ya acotado a una acción por el telón y `sinElFinal`); no se toca `espectador/`.
6. Navegador (Playwright sin pantalla): una partida en la que la IA juega varias jugadas seguidas y otra que acaba por un golpe; capturas del lateral durante la cuenta y al acabar.

## Tras el plan (11-11-2026)

El coordinador aprueba `plan.md` (opción C, congelar). Preguntas abiertas: (1) «Continuar», que aparece en cuanto el estado termina, queda fuera de este ciclo y va a un issue; (2) en la arena, con la persona jugando, que el lateral pase de «Contando…» a congelado se acepta. #253+#264 va en paralelo y roza `partida/dibujo.ts` y `batalla/escena.ts`: el coordinador resuelve el choque al fusionar.
