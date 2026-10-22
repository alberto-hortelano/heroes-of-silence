# Hallazgos de /simplify (consolidados y decididos por el coordinador)

Cuatro revisores (reutilización R, simplificación S, eficiencia E, altitud A) sobre el diff sin
commitear del 22-10-2026. Deduplicados; cada uno con su decisión.

## Se aplican

1. **La IA usa la regla única** (R1). `planHires` (`core/ai/strategy.ts` ~443) vuelve a mirar oro y
   pueblo ocupado: que llame a `contratarBlocker(state, playerId, town.id) === null` (más su reserva).
2. **Una sola compuerta de «no puedes actuar» en la sesión** (R2, A3, E4). Hoy el motivo de la
   salida se antepone a mano en `motivoParaNoReclutar` (session.ts), `views/base.ts:32` y
   `tituloDelFinDeTurno` (panels.ts); licenciar, equipar, comprar, mover… no lo dicen. Que
   `Session.bloqueoDeTurno()` (o la compuerta equivalente que ya leen `clickTile`, `tropaBlocker`…)
   devuelva el turno y, si no, `salidaPendienteBlocker`; solo el camino de contratar (ayuntamiento,
   `hireHero`) mira únicamente el turno. Quitar los tres `motivoDeLaSalida ?? …`. Comprobar que nada
   que deba seguir funcionando con la salida pendiente (abrir/cerrar escenas, el menú, mirar el
   mapa) queda apagado por esto.
3. **El turno, en una sola capa** (R3, E2, A4, S7). `candidatosAHeroe` da solo `contratarBlocker`
   (como dice su comentario); la sesión pone el turno una vez, sin el `.map` que pisa motivos.
4. **El héroe por defecto de la semilla, un sitio** (R7, S12). Una función del núcleo en
   `setup.ts` (p. ej. `heroePorDefectoDeLaSemilla(seed, faccion?)`) que llamen `inicio/inicio.ts` y
   `tools/qa/url-de-partida.ts`.
5. **`heroeAlaURL` sin ids fabricados** (R8, A2, S4, E6). Es un fallo real: si el héroe de salida
   muere y se contrata otro, `find('hero-${viewer}')` no da nada y el clic lanza. En el clic de
   `hire-hero`: leer si había salida pendiente **antes** de contratar y, si la había, escribir
   `heroe=<tipo del botón>`. En `abrePartida`, el `heroe` que ya trae la URL. Borrar `heroeAlaURL`.
6. **Sin `asentarElDeSalida`** (A5, S3). Exportada con un solo llamador y comprobaciones repetidas:
   `createGame` llama a `hireHero` directamente.
7. **`hireHero` de la sesión sale por `cerrarElAyuntamiento`** (A6), no con `scene = 'town'` a mano.
8. **El panel no recita reglas del núcleo** (A7). «Un héroe contratado sale sin tropa: recoge la
   guarnición» / «la misma tropa sea cual sea el tipo» (`views/ayuntamiento.ts` ~44-47): que salgan
   de la vista (lo que lleva el candidato) o se quiten.
9. **La vista se compone una vez al entrar** (E1). En `abrirElAyuntamiento`, cambiar `scene` antes de
   componer (restaurando si lanza) o cachear con la versión de después. Solo el ayuntamiento; la
   morada, que tiene el mismo patrón, queda fuera del diff.
10. **Un solo estado del elegido** (E3, S2). `elegidoEnElAyuntamiento` y `cacheDelAyuntamiento.elegido`
    se escriben juntos y la comparación nunca decide: un solo campo, caché por versión.
11. **Una opción para un hecho** (S1). `NewGameOptions.tipoDelHeroe?: string | null` (`null` = por
    elegir), como el constructor de `Session`; fuera `heroeDeSalidaPorElegir`, su `throw` y el spread.
12. **Un botón en el panel de la base** (S5). `panels.ts` ~696-700: calcular solo el rótulo.
13. **Lo que no depende del tipo va una vez** (S6). `nombre` y `tropa` del candidato van en la vista,
    no repetidos en cada candidato (p. ej. `tropa: Army | null` deriva `deSalida`).
14. **Un getter** (S8). `heroeDeSalidaPendiente` = `motivoDeLaSalida !== null`: dejar uno.
15. **Sin escritura que se pisa** (S9). `status` en session.ts ~1469: la escena elige su ayuda.
16. **La fábrica de la escena de fila** (R5, R6). `delAyuntamiento` casi es `deLaMorada`
    (`encuadrar`, `caja`, `pintar` idénticos) y los botones de la fila son el marcado de
    `views/morada.ts:23-30`: extraer lo común a una fábrica en `escenas/morada.ts` y un
    `botonesDeLaFila(...)` compartido. Si tocar la morada choca con algo, dejarlo y decirlo.
17. **Parámetro muerto** (S11). `toque` de `pulsarEnElAyuntamiento` (capturas.ts) no lo pasa nadie.
18. **Visual: en el ayuntamiento no anda nadie delante de los candidatos.** Con el héroe pendiente
    se pinta el alcaide en medio de la fila (cinco figuras, una que no se elige). En la escena del
    ayuntamiento no se pinta quien anduvo.

## Se descartan a conciencia

- **A1, cambiar la convención de la URL** (`?seed=N` = héroe por defecto pagado; «por elegir» solo
  con `&heroe=` vacío), que ahorraría `url-de-partida.ts` y los cambios en las herramientas: va
  contra la decisión de la crítica aprobada por el usuario con el plan («sin `?heroe=`, la base
  pregunta»). Se apunta como alternativa en la entrega, no se aplica.
- **R4, un ayudante genérico de «escena de fila» en `Session`**: la morada y el ayuntamiento no
  cachean igual (la morada depende de `moradaAbierta`, que cambia fuera de la caché) y `session.ts`
  lo toca otra sesión a la vez; el riesgo de fusión pesa más que las ~40 líneas.
- **R9/S11, generalizar los ayudantes de capturas de la morada y el ayuntamiento**: menor en un
  fichero de 4 800 líneas; solo se quita el parámetro muerto.
- **S10, cambiar el `splice` por `unshift`**: el `splice` es correcto para cualquier jugador y
  `unshift` ataría la regla a que solo elige el j0.
- **S13, la regla CSS de un solo botón**: menor.
- **E5, E7, E8, eficiencia sin coste** (el blocker en cada acción, el peso del menú, la carga de
  hojas): los propios revisores lo dan por bueno.
