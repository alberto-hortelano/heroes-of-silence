# Hallazgos de /simplify sobre las fases A, B y C (02-11-2026)

Cuatro revisores (reutilización, simplificación, eficiencia, altitud) sobre el diff entero. Deduplicados y
decididos por el coordinador. Los números de línea son orientativos (del diff del 02-11).

## A aplicar (por orden de valor)

1. **La formación usa las reglas del despliegue, no una copia** (los cuatro revisores). `formarBlocker` y el
   `case 'formar'` (`core/state/game.ts`) reescriben la casilla del tablero, la zona, «ya sale / ya está en», el
   intercambio y si el otro cabe en la casilla que deja, que ya juzgan `colocarBlocker` y `aplicarDespliegue`.
   Ya divergen (zona con muralla o sin ella, frases distintas). Hacer:
   - `formarBlocker` = turno/héroe propio (`heroeSuyo`, `puestoBlocker`) + `colocarBlocker` sobre la batalla de
     la formación; `formar` = `aplicarDespliegue(colocar)` sobre esa batalla y copiar el `hex` de cada stack a su
     `salida`. La formación se calcula **una vez** por aplicación (hoy, 3-4 `createBattle` por clic).
   - Que `formacionDe`/`batallaDeLaFormacion` no monten un `createBattle` entero si basta `asentar` (decide el
     ingeniero; lo que se ve en la tropa tiene que seguir siendo lo que saldrá).
   - Un solo `enCasilla` (hoy tres: `despliegue.ts`, dentro de `formarBlocker`, `enLaCasilla` de `session.ts`) y
     un solo «quién de mi bando está en `at`» (hoy tres: `colocarBlocker`, `aplicarDespliegue`, `suyoEn`).
     `hexEquals` en vez de comparar col/row a mano.
2. **La tropa es un `DespliegueEnPantalla`, no una segunda implementación** (`Session.formacion`,
   `dichoDeLaFormacion`, `colocarEnLaFormacion`, `moverEnLaFormacion`, `enLaFormacion`, ~90 líneas con las mismas
   cuatro frases). Que la tropa use la misma pieza sobre la batalla de la formación, con un «aplicar» que juega
   `formar` por `run` y el bloqueo de turno en su barra. Con ello, una sola rama de flechas en `main.ts`.
   `Session.formacion` no se reconstruye con cierres en cada lectura (hoy, cada fotograma y cada `mousemove`).
3. **Sin traducción de ids por convención**: `idEnLaFormacion` / `portadorEnLaFormacion` (regex) en
   `tropa/vista.ts` y los ids escritos a mano en `formacionDe`. El stack ya trae `origen.kind` y `slot`: una sola
   traducción portador↔stack exportada por el núcleo junto a la batalla de la formación (o `stackById` + `origen`).
4. **La escena de tropa comparte con la de batalla el «quién está bajo el puntero»** (`unidadEn`, `clicEn`,
   `cercaDelCentro`, el estado de hover): una pieza en `escenas/despliegue.ts` que usen las dos. La copia de la
   tropa ya se desvió (sin `isAlive`, sin `elevacion`, sin `stackHexes`).
5. **La ocultación del rival en una sola puerta del cliente**: hoy `EscenaBatalla` cambia `battle` por
   `batallaALaVista` lectura a lectura, y otras (`pulsar`, los paneles fuera de la rama del despliegue) siguen
   leyendo la batalla entera. Que lo que leen la escena y los paneles (`ControlDeBatalla.battle` o lo que lo
   sustituya) sea ya la vista; la batalla entera, privada de la sesión, salvo el animador (que la necesita para
   contar al rival que aparece: dejarlo dicho y con su porqué). Un test que lo vigile (el defensor que despliega
   no puede pulsar, señalar ni ver en panel a un enemigo oculto).
6. **`recolocar` dentro del animador**: que `observe`/`alDiaCon` coloque a cada uno en su casilla mientras
   `battle.despliegue !== null`, con un helper común a la rama de reinicio (hoy copiada), y sin que cada escena lo
   llame en cada fotograma.
7. **`settleBattle` lee la `salida` del stack**, que viaja en `origen` como la veteranía, en vez de buscarla por
   `slot` en el ejército de antes de la batalla (con sus casos especiales de emboscada y héroe defensor).
8. **`reasentarAlAbrir` reutiliza el asiento de `asentar`** (hoy, otro algoritmo de «primer hueco libre» con su
   propia frase de «no cabe»).
9. **El cliente no deduce de quién es la tanda** (`deLaPersona`, `miBando`, `!iaDelBando`): el núcleo solo se
   para en tandas a mano; el cliente lo lee del núcleo (`despliegueDe`), con el corte de `empezada` de la arena.
10. **Cachés del cliente**:
    - la batalla de la formación por `(version, heroId)`, no por elegido;
    - `aLaVista` con clave `(b, quien, b.despliegue)`, sin construir `firmaDelDespliegue` en cada lectura; la arena
      saca el bando con `TANDAS[b.despliegue.tanda].side`;
    - una foto por `(b, b.despliegue, elegido)` con `enCurso`, `elegido` y `zona` en `DespliegueEnPantalla`;
    - la tropa rehace la clave del animador solo cuando cambia su batalla.
11. **Una sola ayuda «aceptar el despliegue tal cual»** (hoy cuatro copias: `desplegarTalCual`, dos
    `empezarTalCual`, `aceptarElDespliegue`), y los helpers de test copiados (`escenaDe`, `casillaADosPasos`,
    `hastaQue`, `heroeDeBatalla`, `lado`) a `test/helpers.ts`.
12. **Un solo texto de la instrucción** («pulsa a uno… casilla verde… se cambian… flechas»: hoy cuatro sitios) y
    un solo bloque de panel de despliegue para la partida y la arena (`views/panels.ts` / `arena/paneles.ts`) si
    sale sin forzar.

## Descartados a conciencia

- **Flechas arriba/abajo = `[0, ±1]`** (altitud 10): en odd-r `(c, r±1)` es siempre vecina; y la casilla la juzga
  el núcleo. Falso positivo.
- **`stackDe` / `s.count > 0` en `despliegue.ts`** copiando `stackById`/`isAlive`: lo justifica la dirección de
  importación; si el ingeniero los mueve a `types.ts` sin ciclo, mejor, pero no obliga.
- **`zonaEnSuMarco` frente a `bandoDeSalida`** (`board.ts`): unificar solo si `bandoDeSalida` puede recibir el
  alcance sin tocar la muralla y el editor de la arena; si no, se queda.
- **Duplicados internos de `tools/qa/capturas.ts`** (`pulsarEnElTablero`, `elegirEnLaTropa`, `cotaDeLaTropa`):
  herramienta de QA; solo si sale de paso.
- **`despliegueEnCursoBlocker` y `vistaAlColocar` exportadas con un solo lector**: menores.
- **El trabajo nuevo de `createBattle` en el banco** (zona por unidad, cuatro tandas): por batalla, despreciable.
