# QA: licenciar tropa en cualquier casilla del mapa

Validado el 09-11-2026 sobre el diff sin commitear de `claude/infallible-jones-86a0ec` (base
`36401df2`). El código no cambió después de la verificación del ingeniero: la última edición de
`src/` es de las 20:56 y sus capturas son de las 20:59.

## Lo que corrí y por qué

| Comprobación | Por qué | Resultado |
|---|---|---|
| `pnpm typecheck` | cambia código del núcleo y del cliente | sale 0, sin salida |
| `pnpm lint` | ídem | `Checked 768 files … No fixes applied. Found 10 infos.` (las 10 infos no son de este cambio; el ingeniero lo comprobó sobre los 11 ficheros tocados) |
| `pnpm vitest run test/tropa.test.ts test/equipo.test.ts test/paneles.test.ts` | la regla (C1, C2), la mochila (C3, C4) y el «−1» del panel del mapa (C5). No puedo asegurar que el ingeniero los corriera después de su última edición, y con la carga a 0,3 son 5 s | `3 passed (3)`, `62 passed (62)` |
| Navegador: Playwright sin pantalla contra un `pnpm dev --port 3291 --strictPort` arrancado por mí | C5 y C8 en el flujo real, y la pasada adversarial | ver abajo |

**Lo que cito sin repetir**, porque el código no ha cambiado desde que salió en verde
(`implementacion.md`): `pnpm qa` sale 0 con «licencias: 1 en la crónica del agente»; `pnpm banco`
da `ancla: igual` (sha256 `3ea9e845…`, 0/20 sin terminar); `tools/qa/exportaciones.ts` da «ninguna
exportación sin lector»; `morada.test.ts`, `agent-contract.test.ts` y `documentacion.test.ts`, en
verde.

**El servidor.** Lo arranqué con `set -m` en su propia línea, con PID y grupo 159127 y `cwd` en este
worktree, y lo maté por su grupo. Comprobado después: `3291 libre` y el grupo vacío. No toqué ningún
otro proceso.

**Los guiones** están en `qa-navegador/` (`pasadaA.mts`, `pasadaB.mts`, `pasadaC.mts`, con
`comun.mts`). Llevan un espejo `Session` con la misma semilla, como `pnpm capturas`. Todas las
acciones son clics reales en la página (`Mapa.pulsar` y `locator.click`/`tap`), y el espejo solo
sirve para saber qué esperar y elegir casillas. Las capturas están en `capturas/qa/`.

## Criterios

| # | Criterio | Estado | Evidencia |
|---|---|---|---|
| 1 | Licencia en **cualquier casilla** (camino, nodo ajeno, pueblo, paso) | ✅ cumple | **Camino lejos de la base**: semilla 3 orkos, el héroe sale de (10,7) a (7,21), a 14 casillas, `castilloSuyo=no`. «−1» → «Tropa · 3 individuos» (`A-s3-orkos-01…05`). Semilla 12 no-muertos, de (11,8) a (25,6), a 14 casillas: igual (`A-s12-no-muertos-*`). **Pueblo ajeno**: semilla 8 templarios, el héroe dentro de `village-0` en (14,13), de dueño `null` antes y después de entrar, sin guarnición hostil y `castilloSuyo=no`. «−1» → «Tropa · 4» pasa a «Tropa · 3» y la crónica anota «Licenciados 1 × Guardia del temple en (14, 13)» (`B-s8-templarios-01`, `-02`). El paso y la base rival los cubre `tropa.test.ts` (C1, en verde) |
| 2 | Los rechazos siguen con su frase | ✅ cumple | **Fuera de turno, en el navegador**: el «−1» pulsado en la misma tarea que «Terminar el turno» deja la barra en «todavía no es tu turno: ahora juega el jugador 1 (imperio)» y la tropa sigue en 2, también al volver el día 2 (`B-s8-templarios-03`, `-04`). Count, criatura, otro bando y batalla pendiente los cubre `tropa.test.ts` (en verde). Desde la página no se pueden mandar: el botón siempre pide 1 de un tipo que lleva |
| 3 | Se va quien diga `elQueSeIria` y lo puesto vuelve a la mochila, esté donde esté. Crónica `dismissed` | ✅ cumple | Semilla 3: se le quita el gambesón al héroe («×»), se elige en la mochila y «Equipar» se lo pone a un orko con hacha y escudo, que pasa a veterano (`{"equipo":{"armadura":"gambeson"}}`). Con un novato de su tipo, el «−1» está en la fila del novato y no en la del veterano (`A-s3-orkos-03-veterano-con-gambeson`). Tras licenciar al novato, el «−1» pasa a la fila del veterano (`-03b`). Al pulsarlo, la mochila de la página y la del espejo son `["gambeson"]` (`-04`), en (7,21), lejos de la base. Lo mismo en la semilla 12 con dos novatos delante. Crónica: «Licenciados 1 × Orko con hacha y escudo en (7, 21)» una vez por clic |
| 4 | Quedarse sin tropa, como en el castillo | ✅ cumple | Semillas 3 y 12: «−1» hasta «Tropa · 0 individuos». La fila queda en «—», sin botones, la barra vacía y ningún error. «Fin de turno» y «Siguiente héroe» siguen ahí (`A-s3-orkos-05-sin-tropa`). Es la regla de hoy (`equipo.test.ts`) |
| 5 | «−1» en la fila de quien se iría, junto a «Equipar» y «×». Pulsarlo licencia uno y el panel se repinta | ✅ cumple | Con una pieza elegida, **2/2 filas** tienen «−1» y «Equipar» a la vez en las semillas 3, 12 y 5 (`A-*-02-menos-uno-y-equipar`, `C-s5-elfos-*-tropa-con-pieza`). La fila del veterano lleva su «× Gambesón» (`-03`). Tras cada clic, el título «Tropa · N», las filas, la mochila y la crónica cambian en el acto y cuadran con el espejo en cada paso. La pieza elegida sigue elegida después de licenciar («Equipar» sigue en 2 filas, semilla 5) |
| 6 | El agente: misma regla y el texto de `formato.ts` al día. `pnpm qa` bien | ✅ cumple | Leí la prosa nueva de `formato.ts:277-284`, coherente con `formato.ts:329` («si lo licencias, vuelve a la mochila»). El esquema no cambia. `pnpm qa`: lo cito del ingeniero (sale 0) |
| 7 | Tests de la regla, por partes | ✅ cumple | Los leí en el diff y los corrí: `tropa`, `equipo` y `paneles`, 62/62. El ingeniero dice haber visto morder los tres guardias |
| 8 | Playwright en `pnpm dev`; typecheck y lint limpios; banco igual | ✅ cumple | Arriba. Consola: **0 errores y 0 avisos** en las pasadas A (semillas 3 y 12) y B (semilla 8) y en la C de escritorio. En el móvil sale un aviso que no es de este cambio (abajo) |
| 9 | Docs al día con fecha | ✅ cumple | `docs/areas/partida.md` («Dónde se licencia», 09-11-2026, con la cita) y la nota en `docs/historia.md`. `CLAUDE.md` no nombra la restricción (lo busqué) |

## Hallazgos

Ninguno bloqueante ni importante.

1. **Menor: tras un rechazo fuera de turno, la barra sigue diciendo «todavía no es tu turno» cuando
   el turno ya ha vuelto.** Pasos: `/?seed=8&faccion=templarios&heroe=<el de por defecto>`, «Volver
   al mapa», el héroe a `village-0` (14,13), «Fin de turno» → «Terminar el turno» y, antes de que
   vuelva el turno, «−1». Ya en «Día 2 · Semana 1», con «Tu turno» arriba, la barra sigue con «todavía
   no es tu turno: ahora juega el jugador 1 (imperio)» (`B-s8-templarios-04-de-vuelta`). Quien juega
   espera que el mensaje se vaya al volver su turno. No es de este cambio: es como funciona
   `Session.run` para todas las acciones. Este cambio solo lo deja a la vista desde el panel del mapa.
   Y es difícil de provocar a mano, porque sondeando cada 10 ms no vi ninguna ventana con «Turno del
   rival…» pintado: para provocarlo hay que pulsar en la misma tarea que el fin de turno.
2. **Menor (visual): con nombres largos, el «Equipar» baja debajo del «−1».** Pasa en el panel de
   escritorio de los orkos. En la fila «Orko con hacha y escudo», el «Equipar» cae a una segunda línea,
   corrido a la izquierda del «−1» y sin alinear, y la fila dobla su altura
   (`A-s3-orkos-02-menos-uno-y-equipar`). Se lee y se pulsa bien. Con nombres cortos (elfos), los dos
   botones van en línea, también en el móvil de 390 px, sin desbordar ni hacer scroll horizontal
   (`C-s5-elfos-movil-tropa-con-pieza`; cajas de 46 × 34 y 71 × 34 px, dentro de la ventana).

Observaciones que no son hallazgos:

- Un doble clic en «−1» licencia **uno**, no dos (semilla 8: de 3 a 2). Lo hace a propósito
  `clic.ts` (`ev.detail`), igual que en la base.
- Con la tropa licenciada, el máximo de «Movimiento» del héroe sube (de 1 482 a 1 616 en la semilla 3,
  porque el más lento ya no está). Lo que le queda hoy no cambia. Es la regla del movimiento diario, y
  la jugabilidad no se juzga.
- En el móvil, la consola da un aviso del suelo del mapa («se pinta a 133 px por casilla y esta
  pantalla pide 220 … se amplía ×1.65»). No tiene que ver con este cambio.

## Workarounds usados

- **El espejo `Session`**, que juega las mismas acciones a la vez. Solo sirve para saber qué esperar y
  calcular píxeles y casillas: la página se maneja con clics reales. No falsea nada de lo que ve quien
  juega.
- **Para tener una pieza en la mochila**, se le quita el gambesón al héroe con su «×». Quien juega
  puede hacer lo mismo. El arma no se puede quitar, y la barra lo dice bien («se quedaría sin arma de
  cuerpo a cuerpo…»).
- **El clic fuera de turno** se manda por DOM en la misma tarea que «Terminar el turno», porque la
  ventana del turno rival no llega a pintarse. Es el único clic no humano, y la consecuencia está en el
  hallazgo 1.
- Ninguno toca el estado de la partida ni se salta pantallas: se sale de la base con «Volver al
  mapa».

## No probado

- **Con la partida terminada y con una batalla pendiente o en curso**, en el navegador. Llegar a un fin
  de partida o a un aviso de ataque con el panel del mapa a la vista no cabe en el presupuesto. Los
  rechazos de la batalla pendiente y del turno los cubre `tropa.test.ts` (en verde).
- **El héroe sobre un paso o dentro de la base rival**, en el navegador. Lo cubre `tropa.test.ts`
  (C1).
- **Sin arte** (marcadores) y **con agente conectado**, en el navegador. El panel no depende del arte,
  y la regla del agente la cubre `pnpm qa`, citado.
- `pnpm capturas`: no lo corrí. El plan lo cita solo como riesgo, por el «−1» de la escena de la base,
  y en la pasada C el panel del mapa con el héroe en su castillo sale bien.

## Veredicto

**Apto con reservas.** Se cumplen los nueve criterios en el flujo real, con cuatro semillas y cuatro
facciones. Las dos reservas son menores y no bloquean: el mensaje de «no es tu turno» que se queda en
la barra (viene de antes) y el «Equipar» que baja de línea con nombres largos.

## Tras QA (coordinador, 09-11-2026)

- **Hallazgo 2, arreglado**: `filaDeTropa` marca su recuento con `count en-linea`, y
  `.stack .count.en-linea` (`style.css`) no encoge ni parte línea: el que se parte es el nombre. Solo
  la fila de tropa: la regla en `.stack .count` habría tocado la armería, la defensa y los demás
  paneles. Comprobado con `pasadaA.mts` (semilla 3, orkos: «−1» y «Equipar» en la misma línea, 0
  errores en consola), `tools/qa/navegador/neutro.ts` (0 diferencias), `test/paneles.test.ts`, el
  ancla regenerada (`tools/qa/ancla-paneles.ts`: solo `en-linea` y el «−1» del panel del mapa),
  `pnpm typecheck` y `pnpm lint`.
- **Hallazgo 1, fuera de alcance**: el rechazo que se queda en la barra es de `Session.run` para toda
  acción, de antes de esta tarea.
