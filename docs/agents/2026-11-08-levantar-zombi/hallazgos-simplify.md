# Levantar zombi — hallazgos de /simplify (consolidados por el coordinador, 09-11-2026)

Revisado: `git diff 36401df2..137f898f`. Cuatro revisores (reutilización, simplificación, eficiencia,
altitud); aquí, deduplicados y con la decisión tomada. **Aplicar todo lo de «Se aplica»**, en el
orden que convenga; lo de «Se descarta» no se toca.

## Se aplica

### A. Lo que vuelve y lo que sobra: un solo cálculo (comportamiento)
Los cuatro revisores lo señalan. Hoy hay dos recorridos de «lo que vuelve»:
`loQueVuelve` (`state/sobrantes.ts:114`) y `superviviente` (`state/cierre.ts:107`). Usan dos reglas
de «tiene dueño»: `quienVuelve(...) !== null`, que da null también al que pierde sin rendirse, y
`battleOwners(...)[side] === null`. **Es un fallo de comportamiento**: el diálogo propone lo de la
IA calculado *sin* la experiencia de la batalla, pero `settleBattle` (`conLoQueCabe`) lo decide
*con* ella. `laMasBarata` ordena por rango, así que con un ascenso lo propuesto y lo aplicado
pueden diferir. Además, `idos` (`cierre.ts:~194-200`) calla a mano los ascensos de quien se va,
porque se licencia después de cobrar.
- Una sola función de «la tropa que vuelve» por bando (la regla de dueño, una: la de `battleOwners`
  o la que sea correcta; decide cuál con un test que fije el caso del que pierde sin rendirse),
  que lean `sobrantesTrasLaBatalla` y `settleBattle`.
- `Sobrante` lleva el `dueño` y la `propuesta` (`loQueDejaLaIA`), calculados una vez. El cliente
  lee `s.propuesta`. `settleBattle` hace una sola pasada sobre los sobrantes con
  `dejar = dejados[side] ?? s.propuesta`, valida ambos con `dejarBlocker` (así se valida también lo
  de la IA) y lanza si `dejados` nombra un bando que no sobra.
- Se decide lo que se queda **antes** de cobrar la experiencia (o se cobra solo sobre lo que se
  queda), y desaparece `idos`.
- `dueñoDe` y el cálculo del actor en `dejarAtras` (`cierre.ts:254`) sobran: el dueño viene en el
  `Sobrante` o `Dejado`.
- El paso «lo que llevaba puesto va a la mochila» de `dejarAtras` y el de `dismiss`
  (`state/game.ts:393-398`) se escriben en una función que usan los dos.

### B. «Cuánto cabe»: reutilizar lo de `troop.ts`/`sitios.ts`
- `cabe` (`sobrantes.ts:104`) y las frases «aún sobra…» de `dejarBlocker` duplican `lleno`
  (`state/sitios.ts:741`, privada). Exporta `lleno` (mejor desde `hero/troop.ts`, junto a
  `troopRoom`/`troopBlocker`) y úsala.
- La segunda fase de `loQueDejaLaIA` (`sobrantes.ts:210-214`) es `troopsThatFit`
  (`troop.ts:217`) más `contarPorTipo`.
- `sinLoDejado` (`sobrantes.ts:151`) es `ejercitoDe` (`troop.ts:175`) con los recuentos rebajados.

### C. El cadáver, su propio caso en `queSeApunta`
`apuntaACasilla` da true para `cadaver`, así que `queSeApunta` dice `'casilla'`, y el caso se
rescata con `if (h.objetivo === 'cadaver')` en `apuntadoBlocker`, `afectadosDe`, `jugadasDeLanzar`
(dentro de `case 'casilla'`), `resueltosDe` y `lanzarHechizo`.
- `queSeApunta` devuelve `'unidad' | 'casilla' | 'cadaver' | 'nada'`, y cada consumidor despacha con
  un `switch` exhaustivo (la previsión, `prevision.ts:228`; el cliente, `sesion/batalla/libro.ts:48`;
  la IA). El cliente sigue apuntando con `at`; el contrato no cambia de forma.
- `bestCast` (`ai/tactics.ts:~527`) no prevé las jugadas de cadáver (rinden 0 y la IA no las
  lanza: fuera de alcance), o `rindeDeLaJugada` devuelve nada sin prever.

### D. `cadaverEn`, barato
`cadaveresEn` recorre el registro entero, monta un `Map` y ordena a todos los muertos para devolver
`[0]`; `cadaverGastado` es un `stacks.some` dentro de un `filter`. Con `jugadasDeLanzar` y la
pregunta del botón, eso pasa por cada casilla y en cada decisión de la IA.
- `cadaverEn` recorre el registro **hacia atrás** y devuelve el primer `perished` de esa casilla
  que no esté gastado (con un `Set` de los `levantadoDe`, hecho una vez por consulta). Fuera
  `cadaveresEn`. `casillasConCadaver` deduplica sin `O(S²)` si sale fácil.

### E. La validación del cadáver, con un retorno temprano
`problemasDelAlcance` (`magia/validar.ts:375-405`) cose cuatro `!alCadaver` a reglas genéricas.
- `if (alCadaver) return [...objetivo en lista, ...problemasDelCadaver(h, tipo), ...afecta]`, antes
  de las reglas generales. `levantan !== 1 || efectos.length !== 1` (:441) pasa a
  `efectos.length !== 1 || efectos[0]?.tipo !== 'levantar'`.

### F. Construir el stack una vez
- `levantar` (`battle.ts:1233-1270`) copia el literal de ~20 campos de `createBattle`
  (`montaje.ts:234-258`), con el id `${side}-${slot}` y la moral de los no-muertos. Un constructor
  exportado de `montaje.ts` (`stackNuevo(entrada, side, hex, moral, …)`) que usan los dos.
- `levantablesDe` (`montaje.ts:418`) repite lo que hace `resolveUnit` (`hojaDeLaTropa`,
  `cifrasDeUnidad`, `oroDeUnidad`) y el `throw` de `libroDe`: que salga de `resolveUnit`.

### G. `levantables` sin bando
La dimensión por `Side` y `hechizosDelBando` (tercera copia de «hechizos del héroe + poderes»,
junto a `libroDeLaBatalla` y `libroConElCatalogo`) no sirven: la partida no pasa catálogo y la
arena pasa el mismo a los dos bandos. Un solo `Record<id, Levantable>` sacado de los `levantar` de
`state.libro`. Fuera `hechizosDelBando`.

### H. El catálogo de la arena tras un retoque, y el catálogo con el que se levanta
- `catalogoTras` (`arena/retoque.ts:106`) y la adopción de la sesión
  (`client/sesion/sesion-de-arena.ts:231-233`) son el mismo `switch` y ya divergen (`validarUnidad`
  en uno sí y en otro no; `hechizos`). Una sola función del núcleo, o que `retocarEnBatalla`
  devuelva el catálogo nuevo y la sesión lo adopte.
- `catalogoDeLaPelea` (`arena/montaje.ts:150`) y `test/pelea-de-arena.ts:206` caen al catálogo
  guardado del juego para cualquier id que no esté en la pelea: se pierde el fail-loud de antes y
  se contradice «la arena levanta con las cifras de la página». Mira si `MontajeDeArena` puede
  llevar el catálogo de unidades de la página (como ya lleva equipo y hechizos) y levantar con él.
  Si sale demasiado grande, deja la caída **solo** para lo que nombran los `levantar` del libro
  (no para cualquier id), y dilo en `implementacion.md`.

### I. El cliente
- **Fallo que se ve**: `views/cronica.ts:351` (`left_behind`) y `sesion/partida/sobrantes.ts:96`
  escriben «la guarnición de ${nombreDelSitio(…)}», que da «de el puente de (12,8)». Usa
  `deLaGuarnicion`/`delSitio` (ya en `cronica.ts:221`).
- `SobrantesEnPantalla` guarda el `Sobrante` al abrir (con A, `side` y `propuesta` salen de él); no
  recalcula `sobrantesTrasLaBatalla` en cada lectura ni la vista entera en `cambiar`.
- `renderLoQueSobra` (`partida/guarnicion.ts:146`) copia la fila −/+ con «(la IA: N)» de
  `renderDefensa` (:110-126): una función de fila compartida.

### J. Menores
- Quita `side` del hecho `raised`: nadie lo lee y se deduce del stack nuevo (también en el contrato
  y la prosa si lo nombran).

## Se descarta (a conciencia)
- **`levantar` como campo del hechizo en vez de efecto** (altitud 2, simplificación menor): quitaría
  las exclusiones, pero el plan lo eligió así y el editor de magia está hecho alrededor de
  `efectos`; cambiarlo es rehacer el editor. Con E y C, las exclusiones quedan en pocos sitios.
- **Unificar la visibilidad del animador** (`caidas`, `porAparecer`, `gastados`, altitud 8):
  refactor del animador fuera de esta tarea.
- **Dónde vive `laMasBarata`** (altitud 9): en `troop.ts` cierra un ciclo; `fuerza.ts` vale.
- **`mismaBatalla` por prefijo** (altitud 9): se queda; es lo mínimo para que el espectador no
  reinicie.
- **`porSuId` en `dicho.ts`** (altitud 9): nombrar por id evita un ciclo; los nombres del catálogo
  están a medias en inglés («Zombie»), así que no se pierde nada.
- **`levantables` resuelto en cada batalla aunque no se lance** (eficiencia 6) y la doble
  `validarUnidad` del retoque (eficiencia 7): despreciables; G y H los tocan de todos modos.
