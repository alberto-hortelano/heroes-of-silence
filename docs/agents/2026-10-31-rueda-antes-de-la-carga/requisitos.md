# En la carga, la rueda antes que la carrera

## Petición literal

> «Mientras que en el movimiento normal queda bien primero el movimiento y luego la
> rueda de combate, en la carga es anticlimático, debería ser primero la rueda y luego
> el movimiento y el ataque de la carga»
>
> — el usuario, 31-10-2026

## Hoy

Todo golpe cuerpo a cuerpo de quien elige en la rueda (la persona en la partida y la
arena, el agente en el director) **primero anda**: el `attack` sin elecciones se
planta (`plantarse`, `esPlantarse`, `applyAction` de `battle.ts`): escribe el `move`
(con `charge` si hay carga), mueve al stack a `from` y deja `BattleState.golpeEnCurso`
con la carga y la carrera. La sesión (`CruceDeLaRueda`, `session.ts`) espera a que el
animador cuente la marcha y abre la rueda (`DialogoDeLaRueda`, `rueda/dialogo.ts`).
Elegidas las dos (quien pega y quien responde), el golpe escribe `cruce` y `attack`;
el animador cuenta el desenlace de la rueda (`DURACION.cruce`) y luego el golpe.
Escape antes de elegir suelta el golpe (`soltarElGolpe`): quien pega se queda donde
llegó, con su turno y sin la carga, y se le devuelve lo que la carrera costó de más que
el camino más barato. La decisión de 13-10-2026 («primero se anda, luego se elige») se
mantiene para el golpe sin carga.

## Criterios de aceptación

1. **Golpe con carga de la persona** (la carrera que cobra carga, `charge` en su
   `move`): al pulsar el enemigo, la figura **no se mueve**; se abre la rueda con
   quien pega en su casilla de salida. Tras elegir (y responder el otro), se ve el
   desenlace de la rueda, **después** la carrera de la carga y **después** el golpe.
2. **Golpe sin carga** (a pie sin recta, o pegado ya al enemigo, o una recta por
   debajo de `CARGA_MINIMA`): igual que hoy, primero anda y luego la rueda.
3. **Escape antes de elegir en una carga**: quien pega no se ha movido y conserva el
   turno entero, sin nada gastado (no hay carrera que devolver). La barra lo dice como
   hoy.
4. **Cuando cargan a la persona** (la IA o el otro bando de la arena cargan a una de
   sus unidades): la rueda de la respuesta se abre **antes** de que corra quien carga;
   tras responder, desenlace, carrera y golpe, en ese orden.
5. **La previsión de la rueda** (lo que daría cada sector, `previsionDeLaRueda`) cuenta
   la carga de la carrera que se va a correr, igual que hoy cuenta la ya corrida.
6. **El agente** (director, `pasoDelCruce`, `serializeBattleResponse`) sigue
   funcionando: su golpe con carga y su respuesta a una carga se resuelven y el
   veredicto cuenta el cruce como hoy. `pnpm qa` en verde.
7. **El espectador** cuenta la carga en el mismo orden que la partida: desenlace de la
   rueda, carrera, golpe (es la inversa de lo que viaja; `adaptar.ts` sigue siendo la
   inversa exacta).
8. **La arena** igual que la partida (comparte `CruceDeLaRueda` y la rueda).
9. **IA contra IA** (`autoResolve`, sin rueda que esperar) y el banco: si el cambio no
   altera tiradas ni resultados, `pnpm banco` no se mueve; si el orden del registro
   cambia, se reancla con la forma del diff dicha.

## Fuera de alcance

- El golpe sin carga: no cambia.
- El disparo diferido, los poderes y los hechizos.
- Cambiar cuándo hay carga, cuánto cobra o la recta (`cargaDesde`, `CARGA`).
- Rehacer el arte o las duraciones de la carrera o del desenlace.

## Contexto

- No se prueba la jugabilidad (CLAUDE.md): se prueba que el orden y las reglas hagan lo
  que dicen y que lo que se ve funcione.
- Lo visual se juzga mirándolo: la persona querrá ver la secuencia en el navegador
  (el animador y la rueda), no solo tests.
- La máquina es compartida: tests por partes, con su porqué; nada de `pnpm verify`
  entero.

## Preguntas abiertas (con la suposición por defecto)

- **¿Dónde va el desenlace de la rueda, antes o después de la carrera?** Por defecto,
  antes: «primero la rueda y luego el movimiento y el ataque». La carrera y el golpe
  van seguidos, sin la rueda en medio.
- **Escape en una carga**: por defecto, nada se mueve y nada se gasta (criterio 3).
- **¿Qué casilla se ve en la cabecera de la rueda y en el tablero mientras se elige?**
  Por defecto, quien pega en su casilla de salida y la recta de la carga marcada como
  hoy al apuntarla (la casilla de destino y las casillas que corre).
- **¿El registro cambia de orden** (`cruce` antes que el `move` de la carga) **o el
  núcleo mantiene el orden y solo cambia cuándo mueve al stack?** Lo decide el
  arquitecto; lo que importa es que la partida, la arena, el espectador y el agente
  cuenten lo mismo.
