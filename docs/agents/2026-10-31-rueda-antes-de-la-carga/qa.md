# QA — en la carga, la rueda antes que la carrera (31-10-2026)

Validado sobre el árbol de trabajo **con /simplify ya aplicado** (`firmaDelTurno(turno,
golpeEnCurso)`, `golpeBlocker` sin `llegada`). Las verificaciones del informe del ingeniero
son anteriores a /simplify, así que typecheck, lint, tests, `pnpm qa` y `pnpm banco` se
repitieron. Nada commiteado. Nada del código tocado.

Petición literal: «en la carga es anticlimático, debería ser primero la rueda y luego el
movimiento y el ataque de la carga».

## Criterios

| # | Criterio | Veredicto | Evidencia |
|---|---|---|---|
| 1 | Carga de la persona: la figura no se mueve, la rueda se abre con quien pega en su salida; luego desenlace → carrera → golpe | ✅ cumple | **Arena** (vite propio en :3193, Chromium sin pantalla, clics de verdad), semilla 1, Hermano de carga (yo) contra Guerrero con escudo (IA), carga de 4 desde (3,4) hasta (7,4). Al abrirse la rueda, el espejo sigue en (3,4) con el registro +0, y la captura lo enseña en su salida (`qa/arena-carga-rueda-abierta.png`). Tras elegir, el registro es `cruce, move(charge), attack(charge 4)`. En la ráfaga de 300 ms: la rueda abierta (desenlace «Ofensivo contra Rápido») de 0 a 1 200 ms con el jinete quieto, después la carrera de 1 500 a 2 400 ms y el golpe en 2 700 ms (`qa/arena-carga-secuencia.png`). **Partida** (`pnpm dev`, `?seed=1&…&heroe=…`, salir de la base, clic en el monstruo de (1,12)): el Guardia del bosque A carga 4 de (0,6) a (4,6). La rueda se abre con él en (0,6) y el registro +0, y el desenlace «Fuerte contra Romper guardia» va antes de que corra (`qa/partida-carga-secuencia.png`). |
| 2 | Golpe sin carga: igual que hoy, primero anda y luego la rueda | ✅ cumple | Arena, escudo contra escudo, semilla 1: un golpe desde (5,6) a (5,7) sin carga escribe `move` al plantarse. La rueda se abre 1 296 ms tras el clic, con una marcha de 1 117 ms, y tras elegir el registro es `cruce, attack, attack` (`qa/arena-sin-carga-rueda.png`). Tests: `rueda.test.ts` «sin carga, de una vez o en dos, move, cruce, attack» y «Escape sin carga», en verde. |
| 3 | Escape en una carga: no se mueve, conserva el turno entero sin nada gastado, y la barra lo dice | ✅ cumple | Arena: «Golpe cancelado.», la rueda cerrada, el jinete en (3,4) con `gastado 0`, el «»4» otra vez en el tablero y «Le quedan 5 casillas» (`qa/arena-carga-tras-escape.png`). Partida: «Golpe cancelado.», en (0,6) con `gastado 0` y la carga otra vez a mano. Pasada adversarial: **tres Escape seguidos y luego cargar** dan, byte a byte, el mismo `log` y los mismos `stacks` que cargar de una vez con la misma semilla. Así que no gasta `Rng` ni casillas, y la lista legal y `battleMovable()` son iguales tras cada Escape. |
| 4 | Cuando cargan a la persona, la rueda de la respuesta se abre antes de que corra quien carga; luego desenlace, carrera y golpe | ✅ cumple | Arena, Guerrero con escudo (yo) contra Hermano de carga (IA), semilla 1: se pide la respuesta con `defender-0` plantado en (6,4) y la carga de 5 por correr hasta (1,4). Tras responder, el registro es `cruce, move(charge), attack(charge 5), …`. En la ráfaga, el desenlace va de 0 a 900 ms y después el jinete corre desde el medio del tablero y golpea (`qa/arena-le-cargan-secuencia.png`). Hay un detalle menor, el M1. |
| 5 | La previsión de la rueda cuenta la carga por correr | ✅ cumple | La rueda dice «Las cifras llevan la carga de 4 casillas montada, +20 %.» (arena) y «…de 4 casillas, +20 %.» (partida, a pie). Ofensivo da 36–152, por encima del 24–104 de la barra al pasar el ratón, que ya decía «cargando 4 casillas (+20 %)». `rueda.test.ts`: «la previsión plantado con carga = la de antes de plantarse», en verde. |
| 6 | El agente: su golpe con carga y su respuesta a una carga, con el veredicto de siempre; `pnpm qa` en verde | ✅ cumple | `pnpm qa`, salida 0: «golpe: defender-3 … "strong"; attacker-0 respondió "normal"», «respuestas: 5 pedidas, 4 entraron», «batallas del agente: 1, 25.0 peticiones por batalla», «terminado por fin de partida». `agent-contract.test.ts` (`battle_response` ante una carga plantada lleva `chargeFrom`; sin carga no lo lleva; la prosa nombra `"chargeFrom"`) y `agent-link.test.ts`, en verde. `pnpm qa` no dice si alguna respuesta del agente fue a una carga: eso lo cubre el test, no la partida de `qa`. |
| 7 | El espectador cuenta lo mismo | ✅ cumple (por el registro; ⚠️ no mirado a mano) | `golpeEnCurso` no viaja: no aparece en `src/server` ni en `src/client/espectador`, y `adaptar.ts` no cambia. El espectador anima el mismo registro con el mismo `BattleAnimator`. `anim.test.ts` («la carga la marca el `move`: con el cruce delante»: primero `cruceEnCurso()` con la figura en `idle`, después el clip `charge`) y `espectador.test.ts`, en verde. Este último cambió porque en las batallas del director **sí** salen cargas, con el `move(charge)` tras su `cruce`. Del navegador, cito la pasada `espectador` de `pnpm capturas` del ingeniero (verde, pero anterior a /simplify, que no toca lo que viaja). |
| 8 | La arena igual que la partida | ✅ cumple | Las dos páginas montan `DialogoDeLaRueda` igual (`main.ts:331`, `arena/main.ts:2086`) sobre `CruceDeLaRueda`. Lo visto en el navegador (criterios 1 y 3) sale igual en las dos. |
| 9 | IA contra IA y el banco | ✅ cumple | `pnpm banco`: `sha256 d9649d99af7f…`, «ancla: igual — las 20 partidas se juegan hexágono a hexágono igual», sin terminar 0/20. `rueda.test.ts` («`autoResolve`: cada `move` con `charge` va justo tras su `cruce`»), en verde. |

## Pasada adversarial

Con un test temporal (`test/zz-qa-tmp-carga.test.ts`, que borré al acabar) sobre
`SesionDeArena`, y en el navegador:

- **Un retoque con la rueda abierta, con la carga plantada**: `retocar` devuelve «Elige antes
  en la rueda del golpe.» y el `BattleState` no cambia (comparado por JSON). La carrera que se
  anunció no se puede quedar sin sitio por un retoque. En la página, «Editar» queda bajo el
  `<dialog>` modal.
- **Otra jugada estando plantado**: la lista legal es solo `{attack, target}`, y `end_turn`
  no entra («Elige antes en la rueda del golpe.»). El registro no cambia.
- **Volver a cargar tras Escape, tres veces**: como en el criterio 3, idéntico a cargar
  directo.
- **La caché de la sesión**: plantado, `battleMovable()` va vacío y `battleCharges()` solo da
  la plantada. Tras Escape, las dos coinciden con las de antes de plantarse. Esto lo vigilan
  `session.test.ts` y `rueda.test.ts`; el ingeniero vio morder el guardia, y yo no lo repetí.
- **La Finta tras la carga** (jinete contra dos piqueros, carga de 3, semillas 1-20): siempre
  sale `cruce`, `move`, y en las tres semillas donde el turno sigue, la fase es `trasLaFinta`
  con `{gastado: 3, finta: 1}`, 1 casilla y 6 movibles, ninguna carga, y el `move` siguiente
  entra con su firma.
- **Una carga que paga el contacto**: `salir-del-contacto.test.ts` («plantarse con la carga que
  paga el contacto no gasta nada; soltarla tampoco», y al golpear corre la recta), en verde.
- **La consola**: sin errores ni avisos en las cuatro pasadas del navegador (arena con carga,
  arena con la IA cargando, arena sin carga y partida).

## Hallazgos

- **M1 (menor). Cuando te cargan, nada te dice que es una carga, ni desde dónde.** Al abrirse
  la rueda de la respuesta, quien carga está quieto lejos: en la semilla 1 de la arena, en
  (6,4), justo debajo de la rueda, así que no se ve. El tablero no marca su recta ni su
  llegada, y la rueda de la respuesta no lleva la línea de «Las cifras llevan la carga…». La
  cabecera sí dice quién ataca a quién. Antes, quien jugaba veía la carrera antes de
  responder, y ahora lo sabe después. No incumple el criterio 4, que pide justo este orden,
  y el ingeniero ya lo dejó en el backlog (plan §6). Lo apunto porque es la única pérdida de
  información para quien juega. Para repetirlo: `pnpm arena`, `?seed=1`, Guerrero con escudo a
  la izquierda (yo) y Hermano de carga a la derecha (IA), «Luchar» y «Terminar turno»: en la
  ronda 2 se abre la rueda «Tu respuesta» (`qa/arena-le-cargan-respuesta.png`). Quien juega
  esperaba ver quién le carga y desde dónde, o leerlo en la rueda.

No hay hallazgos bloqueantes ni importantes.

## Comprobaciones ejecutadas (por partes)

- `pnpm typecheck`: 0. `pnpm lint`: 0, con las 10 «infos» ajenas de `tools/taller/unidades.ts`.
- `pnpm vitest run` de estos ficheros: `rueda`, `carga`, `salir-del-contacto` (plantarse,
  soltar y el orden del registro); `session` (la caché y Escape en la partida);
  `agent-contract` y `agent-link` (`chargeFrom` y el puente); `espectador` (fotogramas por
  acción con el orden nuevo); `invariantes` (se tocan `golpeEnCurso` y
  `serializeBattleResponse`); `prevision` (`golpePreparado`); `anim` (el orden del desenlace y
  la carrera). Resultado: 10 ficheros, 443 de 444. El único rojo, `anim.test` «la cura de un
  poder sube la barra…» (30 en vez de 35), ya falla en HEAD 872fbb80.
- `pnpm qa`: 0. `pnpm banco`: el mismo sha y el ancla igual.
- No repetí `pnpm capturas`. Cito el informe del ingeniero: la pasada «rueda-del-golpe», en
  verde («defender-0 carga 3 desde (7,4) hasta (4,4) y la rueda se abrió antes de correr»,
  también en el móvil). Sus rojos («edicion», «equipo», «armas») ya salen en HEAD.

## Workarounds usados

- **El espejo** (una `SesionDeArena` o `Session` con la misma semilla, como `pnpm capturas`):
  solo para saber dónde pulsar y para leer el estado, nunca para cambiar la página. Los clics
  y las teclas son de verdad. No afecta a quien juega.
- **`?clima=despejado,dia` en la partida**: fija lo que se pinta, no las reglas, igual que
  `capturas`. No afecta.
- **La política de la partida**: terminar turnos hasta que se me ofreció una carga. Es lo que
  haría quien juega; no se forzó ningún estado.
- **El test temporal** `test/zz-qa-tmp-carga.test.ts`: creado y borrado por mí. Al acabar,
  `git status` es el de antes, más la carpeta `qa/` de las capturas y este `qa.md`.
- **Vite propio** en :3193, arrancado con `set -m`, parado por su grupo y con el puerto
  comprobado libre. No toqué el :3100, que era ajeno.

## No probado

- **El espectador a mano con una carga del agente**, en el navegador: necesitaba el servidor
  y un agente que cargue. Queda cubierto por el registro y los tests (criterio 7) y por la
  pasada `espectador` del ingeniero.
- **El móvil**: no lo repetí, y cito la pasada «rueda-del-golpe-movil» del ingeniero.
- **«Yo contra Yo» en el navegador**: lo cubre `rueda.test.ts`, en verde.

## Veredicto

**Apto.** La carga de la persona y la que recibe se cuentan rueda → desenlace → carrera →
golpe en la partida y en la arena, y Escape no mueve ni gasta. El golpe sin carga sigue igual,
el agente y el banco no cambian, y la consola queda limpia. Solo queda el M1 (menor, ya en el
backlog del plan).
